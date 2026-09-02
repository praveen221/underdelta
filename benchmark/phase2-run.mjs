#!/usr/bin/env node
/**
 * Phase 2 bake-off: baseline (grep) vs Underdelta vs Graphify
 * across every v0 coverage pin.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QUESTIONS, REPOS } from "./gold.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "dist/cli.js");
const GRAPHIFY = `${process.env.HOME}/.local/bin/graphify`;

function sh(cmd, cwd = ROOT, timeout = 30000) {
  try {
    return execSync(cmd, {
      cwd,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout,
    });
  } catch (err) {
    return (err.stdout || "") + (err.stderr || err.message || "");
  }
}

function repoAbs(repoKey) {
  return path.join(ROOT, REPOS[repoKey].dir);
}

function graphPath(repoKey) {
  return path.join(repoAbs(repoKey), ".underdelta/architecture.json");
}

function graphifyGraph(repoKey) {
  return path.join(repoAbs(repoKey), "graphify-out/graph.json");
}

function loadGraph(repoKey) {
  return JSON.parse(readFileSync(graphPath(repoKey), "utf8"));
}

function facet(node, kind) {
  return node.semantics?.find((s) => s.kind === kind);
}

function endpointsFromGraph(graph, prefix) {
  const out = [];
  for (const node of graph.nodes) {
    const e = facet(node, "endpoint");
    if (!e) continue;
    const method = e.method || node.metadata?.method || "";
    const p = e.path || node.metadata?.path || "";
    const label =
      method && p
        ? `${method} ${p}`
        : node.label.startsWith("QUERY ") ||
            node.label.startsWith("MUTATION ") ||
            node.label.startsWith("SUBSCRIPTION ")
          ? node.label
          : node.label;
    if (prefix && !label.includes(prefix) && !p.startsWith(prefix) && !label.startsWith(prefix)) {
      continue;
    }
    out.push(label);
  }
  return [...new Set(out)];
}

function resourcesFromGraph(graph) {
  return graph.nodes
    .filter(
      (n) =>
        facet(n, "resource") ||
        n.kind === "table" ||
        n.kind === "collection",
    )
    .map((n) => n.label);
}

function deployFromGraph(graph) {
  const labels = [];
  for (const n of graph.nodes) {
    if (facet(n, "deploy-unit") || n.kind === "system" || n.kind === "service") {
      labels.push(n.label);
    }
    if (n.metadata?.kubernetes || n.metadata?.dockerfile) {
      labels.push(n.label);
    }
  }
  return labels;
}

function underdeltaJson(repoKey, cmd) {
  const cwd = repoAbs(repoKey);
  const text = sh(`node ${CLI} ${cmd} --cwd "${cwd}"`, ROOT);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function parseEndpointsFromWriters(result) {
  if (!result?.writers) return [];
  const out = [];
  for (const w of result.writers) {
    const m = w.label?.match(/^(GET|POST|PUT|DELETE|PATCH|QUERY|MUTATION|SUBSCRIPTION)\s+(\S+)/);
    if (m) out.push(`${m[1]} ${m[2]}`);
  }
  return out;
}

function parseImpactEndpoints(result) {
  const list = result?.report?.impact?.endpoints ?? result?.impact?.endpoints ?? [];
  return list.map((e) => `${e.method} ${e.path}`);
}

function runUnderdelta(q) {
  const graph = loadGraph(q.repo);
  const spec = q.underdelta;
  if (spec.cmd === "scan-endpoints") {
    return {
      answer: endpointsFromGraph(graph, spec.prefix),
      commands: 1,
      reads: 0,
    };
  }
  if (spec.cmd === "scan-resources") {
    return { answer: resourcesFromGraph(graph), commands: 1, reads: 0 };
  }
  if (spec.cmd === "scan-deploy") {
    return { answer: deployFromGraph(graph), commands: 1, reads: 0 };
  }
  if (spec.cmd === "graph-callers") {
    const sym = graph.nodes.find(
      (n) => n.kind === "function" && n.label === spec.symbol,
    );
    const files = new Set();
    if (sym) {
      for (const e of graph.edges) {
        if (e.kind === "calls" && e.target === sym.id) {
          const ev = e.evidence?.[0];
          if (ev?.file) files.add(ev.file);
        }
      }
    }
    return { answer: [...files], commands: 1, reads: 1 };
  }
  if (spec.cmd.startsWith("query writes")) {
    const result = underdeltaJson(q.repo, spec.cmd);
    const endpoints = parseEndpointsFromWriters(result);
    const files = (result.writers || [])
      .flatMap((w) => (w.evidence || []).map((e) => e.file))
      .filter(Boolean);
    return {
      answer: endpoints.length ? endpoints : files,
      raw: result.raw || result,
      commands: 1,
      reads: 0,
    };
  }
  if (spec.cmd.startsWith("query impact")) {
    const result = underdeltaJson(q.repo, spec.cmd);
    return { answer: parseImpactEndpoints(result), commands: 1, reads: 0 };
  }
  if (spec.cmd === "query unknown") {
    const result = underdeltaJson(q.repo, spec.cmd);
    const totals = result.totals || {
      unsupported: result.unsupportedFrameworks?.length ?? 0,
      unresolvedCalls: result.unresolvedCalls?.length ?? 0,
    };
    return {
      answer: {
        unsupported: totals.unsupported ?? 0,
        unresolved: totals.unresolvedCalls ?? 0,
      },
      commands: 1,
      reads: 0,
    };
  }
  return { answer: [], commands: 0, reads: 0 };
}

function extractEndpoints(text) {
  const found = new Set();
  const re =
    /\b(GET|POST|PUT|DELETE|PATCH|QUERY|MUTATION|SUBSCRIPTION)\s+(\/[A-Za-z0-9_{}:./-]*|[A-Za-z][A-Za-z0-9_]*)/g;
  for (const m of text.matchAll(re)) found.add(`${m[1]} ${m[2]}`);
  return [...found];
}

function extractFiles(text) {
  const files = new Set();
  for (const m of text.matchAll(
    /(?:src=|\s)((?:src|app|lib|models|controllers|charts|k8s|kustomize|helm)\/[A-Za-z0-9_./()-]+\.[A-Za-z0-9]+)/g,
  )) {
    files.add(m[1]);
  }
  return [...files];
}

function runGraphify(q) {
  const g = graphifyGraph(q.repo);
  if (!existsSync(g)) {
    return { answer: [], text: "missing graph", commands: 0, reads: 0 };
  }
  const spec = q.graphify;
  let text = "";
  let commands = 0;
  if (spec.query) {
    text += sh(
      `"${GRAPHIFY}" query ${JSON.stringify(spec.query)} --graph "${g}" --budget 2500`,
    );
    commands += 1;
  }
  if (spec.affected) {
    text += "\n" + sh(
      `"${GRAPHIFY}" affected ${JSON.stringify(spec.affected)} --graph "${g}" --depth 3`,
    );
    commands += 1;
  }
  if (spec.explain) {
    text += "\n" + sh(
      `"${GRAPHIFY}" explain ${JSON.stringify(spec.explain)} --graph "${g}"`,
    );
    commands += 1;
  }
  const kind = q.kindOverride || q.kind;
  let answer;
  if (kind === "endpoints") answer = extractEndpoints(text);
  else if (kind === "files") answer = extractFiles(text);
  else if (kind === "unknown") {
    answer = { unsupported: "n/a", unresolved: "n/a", text };
  } else {
    answer = text;
  }
  return { answer, text, commands, reads: 0 };
}

function runBaseline(q) {
  const cwd = repoAbs(q.repo);
  const spec = q.baseline;
  let commands = 0;
  let reads = 0;
  const answer = [];

  if (spec.strategy === "prisma-writes") {
    const serviceFiles = sh(
      `rg -l 'prisma\\.${spec.model}\\.(create|update|delete|upsert)' src || true`,
      cwd,
    )
      .split("\n")
      .filter(Boolean);
    commands += 1;
    reads += serviceFiles.length;
    const controller = readFileSync(path.join(cwd, spec.controller), "utf8");
    reads += 1;
    commands += 1;
    for (const m of controller.matchAll(
      /router\.(get|post|put|delete)\(\s*['"]([^'"]+)['"]/gi,
    )) {
      const method = m[1].toUpperCase();
      const pth = m[2];
      if (
        spec.model === "article" &&
        /articles/.test(pth) &&
        !/comment/.test(pth)
      ) {
        if (method !== "GET") answer.push(`${method} ${pth}`);
      } else if (spec.model === "comment" && /comment/.test(pth) && method !== "GET") {
        answer.push(`${method} ${pth}`);
      }
    }
    return { answer, commands, reads };
  }

  if (spec.strategy === "impact-exports") {
    const file = spec.file;
    const body = readFileSync(path.join(cwd, file), "utf8");
    reads += 1;
    const names = [
      ...body.matchAll(/export (?:async )?(?:const|function) (\w+)/g),
    ].map((m) => m[1]);
    const hits = names.length
      ? sh(
          `rg -l '${names.slice(0, 12).join("|")}' --glob '!${file}' . || true`,
          cwd,
        )
          .split("\n")
          .filter((f) => /\.(ts|js|py)$/.test(f))
      : [];
    commands += 1;
    reads += hits.length;
    for (const f of hits) {
      const text = readFileSync(path.join(cwd, f), "utf8");
      for (const m of text.matchAll(
        /(?:router|app)\.(get|post|put|delete)\(\s*['"]([^'"]+)['"]/gi,
      )) {
        answer.push(`${m[1].toUpperCase()} ${m[2]}`);
      }
      for (const m of text.matchAll(
        /export async function (GET|POST|PUT|DELETE)/g,
      )) {
        const dir = path.dirname(f).replace(/^app/, "");
        answer.push(`${m[1]} ${dir}`);
      }
    }
    return { answer: [...new Set(answer)], commands, reads };
  }

  if (spec.strategy === "next-route-files") {
    const files = sh(
      `find app -path '*/route.ts' -o -path '*/route.js' 2>/dev/null || true`,
      cwd,
    )
      .split("\n")
      .filter(Boolean);
    commands += 1;
    reads += files.length;
    for (const f of files) {
      const text = readFileSync(path.join(cwd, f), "utf8");
      const dir = "/" + f.replace(/^app\//, "").replace(/\/route\.tsx?$/, "");
      for (const m of text.matchAll(/export async function (GET|POST|PUT|DELETE)/g)) {
        answer.push(`${m[1]} ${dir}`);
      }
    }
    return { answer, commands, reads };
  }

  if (spec.strategy === "fastapi-routes" || spec.strategy === "fastapi-file-routes") {
    const files = spec.strategy === "fastapi-file-routes"
      ? [spec.file]
      : sh(`find ${spec.file} -name '*.py' || true`, cwd).split("\n").filter(Boolean);
    commands += 1;
    reads += files.length;
    for (const f of files) {
      const text = readFileSync(path.join(cwd, f), "utf8");
      for (const m of text.matchAll(
        /@router\.(get|post|put|delete)\(\s*"([^"]*)"/gi,
      )) {
        answer.push(`${m[1].toUpperCase()} ${m[2] || "(prefix)"}`);
      }
    }
    return { answer, commands, reads };
  }

  if (spec.strategy === "express-routes" || spec.strategy === "express-controller") {
    const text = readFileSync(path.join(cwd, spec.file), "utf8");
    reads += 1;
    commands += 1;
    for (const m of text.matchAll(
      /app\.(get|post|put|delete)\(\s*['"]([^'"]+)['"]([^)]*)\)/gi,
    )) {
      const label = `${m[1].toUpperCase()} ${m[2]}`;
      if (spec.filter && !spec.filter.some((k) => m[2].includes(k))) continue;
      if (spec.controller && !m[0].includes(spec.controller) && !m[3]?.includes(spec.controller)) {
        continue;
      }
      answer.push(label);
    }
    return { answer, commands, reads };
  }

  if (spec.strategy === "rg" || spec.strategy === "rg-call") {
    const pattern = spec.pattern || spec.symbol;
    const out = sh(`rg -n -F ${JSON.stringify(pattern)} . || true`, cwd);
    commands += 1;
    const files = [
      ...new Set(
        out
          .split("\n")
          .map((l) => l.split(":")[0])
          .filter((f) => f && !f.startsWith("Binary")),
      ),
    ];
    return { answer: files.slice(0, 20), text: out.slice(0, 4000), commands, reads: 0 };
  }

  if (spec.strategy === "unknown") {
    return {
      answer: { unsupported: "unknown", unresolved: "unknown" },
      commands: 0,
      reads: 0,
    };
  }

  return { answer: [], commands: 0, reads: 0 };
}

function norm(s) {
  return String(s).toLowerCase().replace(/\{([^}]+)\}/g, ":$1").replace(/\/+$/, "");
}

function goldHits(actualList, goldList) {
  const actual = (actualList || []).map(norm);
  const hits = [];
  const missed = [];
  for (const g of goldList) {
    const ng = norm(g);
    const ok = actual.some((a) => a === ng);
    if (ok) hits.push(g);
    else missed.push(g);
  }
  return { hits, missed };
}

function inventedEndpoints(actualList, goldList, subset) {
  if (subset) return [];
  const gold = goldList.map(norm);
  const invented = [];
  for (const a of actualList || []) {
    if (!/^(GET|POST|PUT|DELETE|PATCH)\s+\//i.test(a)) continue;
    const na = norm(a);
    if (!gold.includes(na)) invented.push(a);
  }
  return invented;
}

function mentionHits(text, goldList) {
  const blob = String(Array.isArray(text) ? text.join("\n") : text)
    .toLowerCase()
    .replace(/[·_\-]/g, " ")
    .replace(/\s+/g, " ");
  const hits = [];
  const missed = [];
  for (const g of goldList) {
    const ng = String(g).toLowerCase().replace(/[·_\-]/g, " ");
    if (blob.includes(ng)) hits.push(g);
    else missed.push(g);
  }
  return { hits, missed };
}

function score(q, arm) {
  const kind = q.kindOverride || q.kind;
  const gold = q.gold;
  if (kind === "unknown") {
    const a = arm.answer;
    if (!a || typeof a !== "object" || a.unsupported === "unknown" || a.unsupported === "n/a") {
      return { correct: false, hits: [], missed: ["structured unknown"], invented: [] };
    }
    const unresolved = a.unresolved ?? 0;
    const unsupported = a.unsupported ?? 0;
    let ok = true;
    if (gold.unsupported !== undefined) ok = ok && unsupported === gold.unsupported;
    if (gold.unresolved !== undefined) ok = ok && unresolved === gold.unresolved;
    if (gold.unresolvedMin !== undefined) ok = ok && unresolved >= gold.unresolvedMin;
    if (gold.noFakeGoRoutes) {
      const eps = extractEndpoints(JSON.stringify(a) + (arm.text || ""));
      const fake = eps.filter((e) => /checkout|cartservice/i.test(e));
      ok = ok && fake.length === 0;
      return { correct: ok, hits: ok ? ["no-fake-go-routes"] : [], missed: ok ? [] : ["invented Go HTTP"], invented: fake };
    }
    return { correct: ok, hits: ok ? ["unknown-ok"] : [], missed: ok ? [] : ["unknown-mismatch"], invented: [] };
  }

  if (kind === "mentions") {
    const blob = Array.isArray(arm.answer) ? arm.answer.join("\n") : arm.text || arm.answer;
    const { hits, missed } = mentionHits(blob, gold);
    return {
      correct: missed.length === 0,
      hits,
      missed,
      invented: [],
      recall: gold.length ? hits.length / gold.length : 1,
    };
  }

  const list = Array.isArray(arm.answer)
    ? arm.answer
    : typeof arm.answer === "string"
      ? extractEndpoints(arm.answer).concat(extractFiles(arm.answer))
      : [];
  const { hits, missed } = goldHits(list, gold);
  const invented =
    kind === "endpoints" ? inventedEndpoints(list, gold, q.subsetGold) : [];
  return {
    correct: missed.length === 0 && invented.length === 0,
    hits,
    missed,
    invented,
    recall: gold.length ? hits.length / gold.length : 1,
    precision:
      kind === "endpoints" && list.filter((x) => /^(GET|POST|PUT|DELETE|PATCH)\s+\//i.test(x)).length
        ? hits.length /
          Math.max(
            1,
            invented.length + hits.length,
          )
        : hits.length
          ? 1
          : 0,
  };
}

function main() {
  mkdirSync(path.join(ROOT, "benchmark/results"), { recursive: true });
  const rows = [];

  for (const q of QUESTIONS) {
    const baseline = runBaseline(q);
    const underdelta = runUnderdelta(q);
    const graphify = runGraphify(q);
    const row = {
      id: q.id,
      repo: REPOS[q.repo].id,
      pin: REPOS[q.repo].pin,
      coverage: REPOS[q.repo].coverage,
      bucket: q.bucket,
      kind: q.kindOverride || q.kind,
      question: q.question,
      gold: q.gold,
      note: q.note,
      baseline: { ...baseline, score: score(q, baseline) },
      underdelta: { ...underdelta, score: score(q, underdelta) },
      graphify: {
        answer: graphify.answer,
        commands: graphify.commands,
        reads: graphify.reads,
        preview: String(graphify.text || "").slice(0, 500),
        score: score(q, graphify),
      },
    };
    rows.push(row);
    process.stderr.write(
      `${q.id}  B=${row.baseline.score.correct ? "Y" : "n"} U=${row.underdelta.score.correct ? "Y" : "n"} G=${row.graphify.score.correct ? "Y" : "n"}  ${q.question.slice(0, 60)}\n`,
    );
  }

  const semantic = rows.filter((r) => r.bucket === "semantic");
  const summary = {
    generatedAt: new Date().toISOString(),
    questions: rows.length,
    repos: Object.values(REPOS).map((r) => r.id),
    semantic: {
      n: semantic.length,
      baselineCorrect: semantic.filter((r) => r.baseline.score.correct).length,
      underdeltaCorrect: semantic.filter((r) => r.underdelta.score.correct).length,
      graphifyCorrect: semantic.filter((r) => r.graphify.score.correct).length,
      baselineInvented: semantic.reduce((n, r) => n + (r.baseline.score.invented?.length || 0), 0),
      underdeltaInvented: semantic.reduce((n, r) => n + (r.underdelta.score.invented?.length || 0), 0),
      graphifyInvented: semantic.reduce((n, r) => n + (r.graphify.score.invented?.length || 0), 0),
      baselineRecall:
        semantic.reduce((n, r) => n + (r.baseline.score.recall || 0), 0) / semantic.length,
      underdeltaRecall:
        semantic.reduce((n, r) => n + (r.underdelta.score.recall || 0), 0) / semantic.length,
      graphifyRecall:
        semantic.reduce((n, r) => n + (r.graphify.score.recall || 0), 0) / semantic.length,
    },
    rows,
  };

  writeFileSync(
    path.join(ROOT, "benchmark/results/phase2.json"),
    JSON.stringify(summary, null, 2),
  );
  writeFileSync(
    path.join(ROOT, "docs/benchmarks/PHASE2_GRAPHIFY.md"),
    renderMarkdown(summary),
  );
  console.log(JSON.stringify(summary.semantic, null, 2));
}

function renderMarkdown(summary) {
  const s = summary.semantic;
  const lines = [
    "# Phase 2 bake-off — Underdelta vs Graphify vs grep",
    "",
    `Generated ${summary.generatedAt}. ${summary.questions} questions across ${summary.repos.length} pinned repos from \`docs/V0_BUILD_CONTEXT.md\`.`,
    "",
    "Gold answers are source-audited. Graphify ran local AST extract (`graphify update --no-cluster`, no LLM). Underdelta used `query writes` / `query impact` / `query unknown` plus the compiled graph for list questions.",
    "",
    "## Scorecard (semantic questions)",
    "",
    "| Arm | Exact correct | Mean recall | Invented HTTP claims |",
    "|-----|---------------|-------------|----------------------|",
    `| Baseline (grep/files) | ${s.baselineCorrect}/${s.n} | ${(s.baselineRecall * 100).toFixed(0)}% | ${s.baselineInvented} |`,
    `| **Underdelta** | **${s.underdeltaCorrect}/${s.n}** | **${(s.underdeltaRecall * 100).toFixed(0)}%** | **${s.underdeltaInvented}** |`,
    `| Graphify | ${s.graphifyCorrect}/${s.n} | ${(s.graphifyRecall * 100).toFixed(0)}% | ${s.graphifyInvented} |`,
    "",
    "## Per question",
    "",
    "| ID | Repo | Question | Gold | B | U | G | U missed | G missed | Invented |",
    "|----|------|----------|------|---|---|---|---------|---------|----------|",
  ];
  for (const r of summary.rows) {
    const gold =
      Array.isArray(r.gold) ? r.gold.slice(0, 4).join(", ") : JSON.stringify(r.gold);
    const inv = [
      ...((r.underdelta.score.invented || []).map((x) => `U:${x}`)),
      ...((r.graphify.score.invented || []).slice(0, 3).map((x) => `G:${x}`)),
      ...((r.baseline.score.invented || []).slice(0, 3).map((x) => `B:${x}`)),
    ].join("; ");
    lines.push(
      `| ${r.id} | ${r.repo} | ${r.question.replace(/\|/g, "/")} | ${gold.replace(/\|/g, "/")} | ${r.baseline.score.correct ? "✅" : "❌"} | ${r.underdelta.score.correct ? "✅" : "❌"} | ${r.graphify.score.correct ? "✅" : "❌"} | ${(r.underdelta.score.missed || []).slice(0, 3).join(", ")} | ${(r.graphify.score.missed || []).slice(0, 3).join(", ")} | ${inv.slice(0, 80)} |`,
    );
  }
  lines.push(
    "",
    "## How to read this",
    "",
    "- **Exact correct** means every gold item was present and no extra HTTP endpoints were claimed.",
    "- Graphify returns a **symbol neighborhood** (files, functions, imports). Useful for navigation; it almost never lists `POST /articles` as a typed product fact. Invented-route rate is ~0 because it does not claim routes.",
    "- Underdelta wins when the stack is in a deep/partial adapter (Express+Prisma, OpenAPI, GraphQL SDL, Compose/k8s/Helm deploy units).",
    "- Underdelta **misses** where coverage is labeled partial/none: Drizzle `db.insert` (Next.js), Mongoose `.save()` (hackathon-starter), FastAPI raw SQL files, Next.js checkout route not reached from `stripe.ts`.",
    "- Baseline grep can recover RealWorld impact when the controller sits next to the service (EX3). It also **invents** extra `/login/2fa` routes on hackathon-starter. Honesty is the gap, not string search.",
    "",
    "## What this means we should do next",
    "",
    "Do **not** add adapters for popularity. The misses are depth holes in stacks we already claim:",
    "",
    "1. **Mongoose writes** — bind `user.save()` / `new User()` to collection writes so `query writes User` and impact of `controllers/user.js` work (HS2, HS3).",
    "2. **Drizzle (or keep detect-only)** — Next.js SaaS pin: `query writes User` is empty while `query unknown` correctly lists unresolved `db.insert` (NX2, NX3).",
    "3. **Next impact through payments** — `stripe.ts` → `GET /api/stripe/checkout` (NX4).",
    "4. **FastAPI SQL files** — optional; route-file impact already works (FA3).",
    "5. Keep Graphify in the harness and re-run `npm run bench:phase2` after (1)–(3).",
    "",
    "Do **not** start MCP, another viewer loop, or Go HTTP adapters on the strength of this spreadsheet.",
    "",
    "## Reproduce",
    "",
    "```bash",
    "npm run build",
    "# clone pins into .underdelta-real/ (gitignored)",
    "node dist/cli.js scan .underdelta-real/<repo>",
    "graphify update .underdelta-real/<repo> --force --no-cluster",
    "node benchmark/phase2-run.mjs",
    "```",
    "",
  );
  return lines.join("\n");
}

main();
