import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
const gold = JSON.parse(readFileSync(new URL("./gold.json", import.meta.url), "utf8"));
const goldBy = Object.fromEntries(gold.tasks.map((t) => [t.id, t]));
const start = new Date(readFileSync(new URL("./results/START", import.meta.url), "utf8").trim()).getTime();

const normEp = (s) => String(s).trim().toUpperCase().replace(/\s+/g, " ")
  .replace(/\{(\w+)\}/g, "[$1]").replace(/:(\w+)/g, "[$1]").replace(/\/\([^)]+\)/g, "")
  .replace(/\/$/, "").replace(/^([A-Z]+) (?!\/API)\//, "$1 /API/");
const normModel = (s) => String(s).trim().replace(/^[a-z]/, (c) => c.toUpperCase());
const normFile = (s) => String(s).trim().replace(/^\.?\//, "").replace(/^dub\//, "").replace(/^\/tmp\/p3\/dub\//, "");

function cmp(actual, goldList, norm) {
  const A = new Set((actual || []).map(norm)), G = new Set(goldList.map(norm));
  const hits = [...G].filter((x) => A.has(x)), missed = [...G].filter((x) => !A.has(x)), invented = [...A].filter((x) => !G.has(x));
  return { hits: hits.length, missed, invented, recall: G.size ? hits.length / G.size : (A.size ? 0 : 1), precision: A.size ? hits.length / A.size : 1 };
}

const files = readdirSync(new URL("./results", import.meta.url)).filter((f) => /^[AB]-\d\.json$/.test(f)).sort();
const summary = {};
const perTask = {};
for (const f of files) {
  let r; try { r = JSON.parse(readFileSync(new URL(`./results/${f}`, import.meta.url), "utf8")); } catch (e) { console.log(f, "PARSE ERROR", e.message); continue; }
  const arm = r.arm || f[0];
  const secs = Math.round((statSync(new URL(`./results/${f}`, import.meta.url)).mtimeMs - start) / 1000);
  let inv = 0, recSum = 0, n = 0, precSum = 0, trapOk = 0;
  const rows = [];
  for (const t of gold.tasks) {
    const a = (r.tasks || []).find((x) => x.id === t.id) || {};
    let res;
    if (t.kind === "nav") res = cmp(a.files, t.files, normFile);
    else {
      const e = cmp(a.endpoints, t.endpoints, normEp);
      const m = t.models !== undefined ? cmp(a.models, t.models, normModel) : { hits: 0, missed: [], invented: [], recall: 1, precision: 1 };
      res = { hits: e.hits + m.hits, missed: [...e.missed, ...m.missed.map((x) => "model:" + x)], invented: [...e.invented, ...m.invented.map((x) => "model:" + x)],
        recall: t.models !== undefined && t.models.length ? (e.recall + m.recall) / 2 : e.recall, precision: (e.precision + m.precision) / 2 };
      if (t.id === "T6" && (a.endpoints || []).length === 0) trapOk = 1;
    }
    inv += res.invented.length; recSum += res.recall; precSum += res.precision; n++;
    rows.push({ id: t.id, recall: +res.recall.toFixed(2), invented: res.invented, missed: res.missed.slice(0, 6), note: (a.unknown_note || "").slice(0, 140) });
    (perTask[t.id] ||= {})[f] = { recall: +res.recall.toFixed(2), inv: res.invented.length };
  }
  const s = { file: f, arm, secs, toolCalls: r.tool_calls_total, filesRead: r.files_read_total, invented: inv, meanRecall: +(recSum / n).toFixed(3), meanPrecision: +(precSum / n).toFixed(3), t6TrapOk: trapOk };
  (summary[arm] ||= []).push(s);
  console.log("\n=====", f, JSON.stringify(s));
  for (const row of rows) console.log(row.id, "recall", row.recall, "inv", row.invented.length ? row.invented : "", "missed", row.missed.length, row.note ? "| " + row.note : "");
}
console.log("\n===== PER TASK (recall/inv) =====");
for (const [id, m] of Object.entries(perTask)) console.log(id, Object.entries(m).map(([f, v]) => `${f.replace(".json", "")}=${v.recall}/${v.inv}`).join("  "));
console.log("\n===== ARM MEANS =====");
const out = {};
for (const [arm, list] of Object.entries(summary)) {
  const avg = (k) => +(list.reduce((s, x) => s + (Number(x[k]) || 0), 0) / list.length).toFixed(2);
  out[arm] = { sessions: list.length, invented: avg("invented"), meanRecall: avg("meanRecall"), meanPrecision: avg("meanPrecision"), toolCalls: avg("toolCalls"), filesRead: avg("filesRead"), secs: avg("secs"), t6TrapOk: avg("t6TrapOk") };
  console.log(arm, JSON.stringify(out[arm]));
}
if (out.A && out.B) {
  const inventedDrop = out.A.invented ? 1 - out.B.invented / out.A.invented : (out.B.invented === 0 ? 1 : -1);
  const pass1 = inventedDrop >= 0.5 && out.A.invented - out.B.invented >= 3;
  const pass2 = out.B.meanRecall >= out.A.meanRecall;
  console.log("\nKILL RULE: invented drop", (inventedDrop * 100).toFixed(0) + "%", "(need >=50% and >=3 abs):", pass1 ? "PASS" : "FAIL", "| recall B>=A:", pass2 ? "PASS" : "FAIL", "| VERDICT:", pass1 && pass2 ? "CONTINUE" : "STOP");
}
