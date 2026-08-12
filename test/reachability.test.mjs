import assert from "node:assert/strict";
import test from "node:test";

import { analyzeArchitecture } from "../dist/analysis.js";
import { compileRepository } from "../dist/compile.js";
import { typescriptExtractor } from "../dist/extractors/typescript.js";
import { computeChangeImpact } from "../dist/impact.js";
import {
  collectCallMetrics,
  findPaths,
  pathsFromSymbolToResources,
} from "../dist/reachability.js";
import { impactReportSchema } from "../dist/schema.js";
import { extract, edgeBy, nodeBy } from "./helpers.mjs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("typescript resolves imported calls without relying on unique names", async () => {
  const graph = await extract(typescriptExtractor, {
    "src/a.ts": "export function shared() { return 1; }\n",
    "src/b.ts": "export function shared() { return 2; }\n",
    "src/use.ts": [
      'import { shared as fromA } from "./a";',
      'import { shared as fromB } from "./b";',
      "export function run() { return fromA() + fromB(); }",
      "",
    ].join("\n"),
  });
  const run = nodeBy(graph, "function", "run");
  const aShared = graph.nodes.find(
    (node) => node.kind === "function" && node.qualifiedName === "src/a.ts#shared",
  );
  const bShared = graph.nodes.find(
    (node) => node.kind === "function" && node.qualifiedName === "src/b.ts#shared",
  );
  assert.ok(aShared && bShared);
  edgeBy(graph, "calls", run.id, aShared.id);
  edgeBy(graph, "calls", run.id, bShared.id);
});

test("typescript resolves namespace import method calls and re-exports", async () => {
  const graph = await extract(typescriptExtractor, {
    "src/lib/calc.ts": "export function total(n) { return n; }\n",
    "src/lib/index.ts": 'export { total } from "./calc";\n',
    "src/service.ts": [
      'import * as lib from "./lib";',
      "export function checkout() { return lib.total(1); }",
      "",
    ].join("\n"),
  });
  const checkout = nodeBy(graph, "function", "checkout");
  const total = nodeBy(graph, "function", "total");
  edgeBy(graph, "calls", checkout.id, total.id);
});

test("typescript records ambiguous same-name calls without inventing edges", async () => {
  const graph = await extract(typescriptExtractor, {
    "src/a.ts": "export function twin() { return 1; }\n",
    "src/b.ts": "export function twin() { return 2; }\n",
    "src/use.ts": [
      // No import — bare twin() is ambiguous across the repo.
      "export function run() { return twin(); }",
      "",
    ].join("\n"),
  });
  const run = nodeBy(graph, "function", "run");
  const callEdges = graph.edges.filter(
    (edge) => edge.kind === "calls" && edge.source === run.id,
  );
  assert.equal(callEdges.length, 0);
  assert.ok(
    graph.diagnostics.some((diagnostic) => diagnostic.code === "call-ambiguous"),
  );
});

test("call metrics and path queries reach resources from handlers", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-reach-"));
  try {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "reach-fixture" }),
      "utf8",
    );
    await writeFile(
      path.join(root, "src", "billing.ts"),
      [
        "export function calculateTotal() {",
        "  return prisma.order.create({});",
        "}",
        "export function checkout() {",
        "  return calculateTotal();",
        "}",
        'app.post("/checkout", checkout);',
        "",
      ].join("\n"),
      "utf8",
    );
    const graph = await compileRepository(root);
    const metrics = collectCallMetrics(graph);
    assert.ok(metrics.callsResolved >= 1);

    const checkout = graph.nodes.find(
      (node) => node.kind === "function" && node.label === "checkout",
    );
    assert.ok(checkout);
    const paths = pathsFromSymbolToResources(graph, checkout.id);
    assert.ok(paths.length >= 1, "expected checkout → resource path");
    const analysis = analyzeArchitecture(graph);
    assert.ok(analysis.callMetrics.callsResolved >= 1);

    const impact = computeChangeImpact(graph, ["src/billing.ts"]);
    const report = impactReportSchema.parse(impact);
    assert.ok(report.changed.symbols.some((symbol) => symbol.label === "checkout"));
    assert.ok(
      report.impact.endpoints.some(
        (endpoint) => endpoint.method === "POST" && endpoint.path === "/checkout",
      ) || report.highlightNodeIds.length > 0,
    );
    assert.ok(report.impact.resources.some((resource) => resource.label === "order"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("findPaths stops at product anchors with evidence certainty", async () => {
  const graph = await extract(typescriptExtractor, {
    "src/h.ts": [
      "export function writeOrder() { return prisma.order.create({}); }",
      "export function handle() { return writeOrder(); }",
      "",
    ].join("\n"),
  });
  const handle = nodeBy(graph, "function", "handle");
  const paths = findPaths(
    {
      schemaVersion: "0.2",
      project: { name: "t", root: "." },
      generatedAt: new Date().toISOString(),
      extractors: [],
      adapters: [],
      nodes: graph.nodes,
      edges: graph.edges,
      diagnostics: graph.diagnostics ?? [],
    },
    handle.id,
    (node) => node.kind === "table",
  );
  assert.ok(paths.length >= 1);
  assert.ok(paths[0].steps.some((step) => step.edgeKind === "writes" || step.edgeKind === "calls"));
});
