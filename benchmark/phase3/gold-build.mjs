import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = process.env.DUB_ROOT || "/tmp/p3/dub";
const files = execSync(`rg --files -g '*.ts' -g '*.tsx' apps/web`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64e6 })
  .split("\n").filter(Boolean).filter((f) => !/\.(test|spec)\.tsx?$/.test(f) && !/\/tests?\//.test(f));
const src = new Map(files.map((f) => [f, readFileSync(path.join(ROOT, f), "utf8")]));

const routeFiles = files.filter((f) => /^apps\/web\/app\/(?:\([^)]+\)\/)?api\/.*\/route\.tsx?$/.test(f));
const routeSet = new Set(routeFiles);
function routePath(f) {
  return f.replace(/^apps\/web\/app/, "").replace(/\/route\.tsx?$/, "").replace(/\/\([^)]+\)/g, "");
}
function resolveRel(fromFile, spec) {
  const base = path.normalize(path.join(path.dirname(fromFile), spec));
  for (const c of [base, base + ".ts", base + ".tsx", path.join(base, "route.ts")]) if (src.has(c)) return c;
  return null;
}
function routeMethods(f, depth = 0) {
  const ms = new Set();
  const s = src.get(f);
  for (const m of s.matchAll(/export\s+(?:const|async function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) ms.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
    for (const part of m[1].split(",")) { const n = part.trim().split(/\s+as\s+/).pop(); if (/^(GET|POST|PUT|PATCH|DELETE)$/.test(n)) ms.add(n); }
  }
  if (depth < 3) for (const m of s.matchAll(/export\s*\*\s*from\s*["']([^"']+)["']/g)) {
    const t = resolveRel(f, m[1]); if (t) for (const x of routeMethods(t, depth + 1)) ms.add(x);
  }
  return [...ms];
}
const JOBS_ROUTE = files.find((f) => /api\/jobs\/process\/\[jobName\]\/route\.ts$/.test(f));
const routeEndpoints = new Map(routeFiles.map((f) => [f, routeMethods(f).map((m) => `${m} ${routePath(f)}`)]));
// route files that re-export another route file wholesale (legacy (old)/projects/* aliases)
const reExporters = new Map();
for (const f of routeFiles) for (const m of src.get(f).matchAll(/export\s*\*\s*from\s*["']([^"']+)["']/g)) {
  const t = resolveRel(f, m[1]); if (t && routeSet.has(t)) { if (!reExporters.has(t)) reExporters.set(t, []); reExporters.get(t).push(f); }
}
function expandRoutes(routes) {
  const out = new Set(routes);
  for (const r of routes) for (const x of reExporters.get(r) || []) out.add(x);
  return [...out].sort();
}

function exportsOf(f) {
  const s = new Set();
  for (const m of src.get(f).matchAll(/export\s+(?:async\s+)?(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/g)) s.add(m[1]);
  for (const m of src.get(f).matchAll(/export\s*\{([^}]+)\}/g)) for (const part of m[1].split(",")) { const n = part.trim().split(/\s+as\s+/).pop(); if (n) s.add(n); }
  return [...s].filter((n) => n.length > 3 && !["GET","POST","PUT","PATCH","DELETE","default"].includes(n));
}
function usersOf(symbol, exclude) {
  const re = new RegExp(`\\b${symbol}\\b`);
  return files.filter((f) => f !== exclude && re.test(src.get(f)));
}
// symbol-level upstream to routes
function upstreamRoutes(target, maxDepth = 6) {
  const seenFiles = new Set([target]);
  const routes = new Set();
  let frontier = [target];
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next = [];
    for (const f of frontier) {
      for (const sym of exportsOf(f)) {
        for (const u of usersOf(sym, f)) {
          if (seenFiles.has(u)) continue;
          // require an import relation somewhere in the user file (named import of the symbol)
          if (!new RegExp(`import[^;]*\\b${sym}\\b[^;]*from`).test(src.get(u))) continue;
          seenFiles.add(u);
          if (routeSet.has(u)) routes.add(u); else next.push(u);
          // jobs registry dispatches lib/jobs/handlers/* by name from the jobs route
          if (/^apps\/web\/lib\/jobs\/handlers\//.test(u) && JOBS_ROUTE) routes.add(JOBS_ROUTE);
        }
      }
    }
    frontier = next;
  }
  return expandRoutes([...routes]);
}
const writeRe = /\b(?:prisma|tx)\.([a-zA-Z]+)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/g;
function modelsWrittenIn(f) {
  const s = new Set();
  for (const m of src.get(f).matchAll(writeRe)) s.add(m[1][0].toUpperCase() + m[1].slice(1));
  return [...s];
}
// downstream by named imports (depth 2)
const defIndex = new Map();
for (const f of files) for (const s of exportsOf(f)) { if (!defIndex.has(s)) defIndex.set(s, []); defIndex.get(s).push(f); }
function downstream(f, depth = 2) {
  const seen = new Set([f]); let frontier = [f];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next = [];
    for (const x of frontier) {
      for (const m of src.get(x).matchAll(/import\s*\{([^}]+)\}\s*from\s*["'](@\/|\.)[^"']*["']/g)) {
        for (const part of m[1].split(",")) {
          const n = part.trim().split(/\s+as\s+/)[0].trim();
          for (const def of defIndex.get(n) || []) if (!seen.has(def)) { seen.add(def); next.push(def); }
        }
      }
    }
    frontier = next;
  }
  return [...seen];
}
function impactGold(target) {
  const routes = upstreamRoutes(target);
  const endpoints = [...new Set(routes.flatMap((r) => routeEndpoints.get(r)))].sort();
  const models = new Set();
  for (const m of modelsWrittenIn(target)) models.add(m);
  return { endpoints, models: [...models].sort(), routeFiles: routes };
}
function writesGold(model) {
  const writers = files.filter((f) => modelsWrittenIn(f).includes(model));
  const eps = new Set();
  for (const w of writers) {
    if (routeSet.has(w)) for (const r of expandRoutes([w])) for (const e of routeEndpoints.get(r)) eps.add(e);
    if (/^apps\/web\/lib\/jobs\/handlers\//.test(w) && JOBS_ROUTE) for (const e of routeEndpoints.get(JOBS_ROUTE)) eps.add(e);
    for (const r of upstreamRoutes(w, 5)) for (const e of routeEndpoints.get(r)) eps.add(e);
  }
  return { endpoints: [...eps].sort(), writerFiles: writers };
}

const impactTargets = [
  "apps/web/lib/api/links/delete-link.ts",
  "apps/web/lib/api/domains/verify-domain.ts",
  "apps/web/lib/api/tags/combine-tag-ids.ts",
  "apps/web/lib/api/links/bulk-delete-links.ts",
  "apps/web/lib/api/domains/mark-domain-deleted.ts",
  "apps/web/lib/api/links/archive-link.ts",
];
const gold = { repo: "dubinc/dub@0d8c84e", tasks: [] };
impactTargets.forEach((t, i) => gold.tasks.push({ id: `T${i + 1}`, kind: "impact", target: t, ...impactGold(t) }));
for (const [i, model] of ["Tag", "Webhook"].entries()) gold.tasks.push({ id: `T${7 + i}`, kind: "writes", model, ...writesGold(model) });
{
  const t = "apps/web/lib/api/links/get-link-or-throw.ts";
  const syms = exportsOf(t);
  const users = new Set(); for (const s of syms) for (const u of usersOf(s, t)) if (new RegExp(`import[^;]*\\b${s}\\b`).test(src.get(u))) users.add(u);
  gold.tasks.push({ id: "T9", kind: "nav", target: t, symbols: syms, files: [...users].sort() });
}
{
  const t = "apps/web/lib/api/tags/combine-tag-ids.ts";
  const syms = exportsOf(t);
  const users = new Set(); for (const s of syms) for (const u of usersOf(s, t)) if (new RegExp(`import[^;]*\\b${s}\\b`).test(src.get(u))) users.add(u);
  gold.tasks.push({ id: "T10", kind: "nav", target: t, symbols: syms, files: [...users].sort() });
}
writeFileSync(new URL("./gold.json", import.meta.url), JSON.stringify(gold, null, 2));
for (const t of gold.tasks) console.log(t.id, t.kind, t.target || t.model, "| eps", t.endpoints?.length ?? "-", "| models", t.models?.join(",") ?? "-", "| files", t.files?.length ?? "-");
