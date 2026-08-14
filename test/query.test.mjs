import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { compileRepository } from "../dist/compile.js";
import {
  persistArchitectureGraph,
  readCacheFingerprint,
} from "../dist/graphCache.js";
import {
  loadArchitectureGraph,
  queryImpactFromGraph,
  queryUnknown,
  queryWrites,
} from "../dist/query.js";

async function writeExpressPackage(root, name) {
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name,
      dependencies: { express: "4.21.0" },
    }),
    "utf8",
  );
}

function syntheticGraph(overrides = {}) {
  return {
    schemaVersion: "0.2",
    project: { name: "query-synthetic", root: "/" },
    generatedAt: "2026-08-15T00:00:00.000Z",
    extractors: [],
    adapters: [],
    nodes: [],
    edges: [],
    diagnostics: [],
    ...overrides,
  };
}

test("query writes lists typed endpoint writers for a Prisma table", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-query-writes-"));
  try {
    await writeExpressPackage(root, "query-writes");
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
    const result = queryWrites(graph, "order");
    assert.equal(result.query, "writes");
    assert.equal(result.ambiguous, undefined);
    assert.equal(result.resource.label, "order");
    assert.ok(result.graph.generatedAt);
    assert.ok(
      result.writers.some(
        (writer) =>
          writer.kind === "endpoint" &&
          writer.method === "POST" &&
          writer.path === "/checkout",
      ),
      `expected POST /checkout writer, got ${JSON.stringify(result.writers)}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("query impact on an imported service file reports the writing endpoint", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-query-impact-"));
  try {
    await writeExpressPackage(root, "query-impact");
    await writeFile(
      path.join(root, "src", "billing.service.ts"),
      [
        "export const calculateTotal = async () => {",
        "  return prisma.order.create({});",
        "};",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(root, "src", "billing.controller.ts"),
      [
        'import { calculateTotal } from "./billing.service";',
        'app.post("/checkout", async (req, res) => {',
        "  return calculateTotal();",
        "});",
        "",
      ].join("\n"),
      "utf8",
    );
    const graph = await compileRepository(root);
    const result = queryImpactFromGraph(graph, ["src/billing.service.ts"]);
    assert.equal(result.query, "impact");
    assert.ok(
      result.report.impact.endpoints.some(
        (endpoint) =>
          endpoint.method === "POST" && endpoint.path === "/checkout",
      ),
      `expected POST /checkout from service-file change, got ${JSON.stringify(result.report.impact.endpoints)}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("query writes refuses equally ranked resources", () => {
  const left = "table:billing:account:1111111111";
  const right = "table:auth:account:2222222222";
  const graph = syntheticGraph({
    nodes: [
      {
        id: left,
        kind: "table",
        label: "Account",
        metadata: {},
        evidence: [{ file: "billing.prisma", certainty: "observed" }],
      },
      {
        id: right,
        kind: "table",
        label: "Account",
        metadata: {},
        evidence: [{ file: "auth.prisma", certainty: "observed" }],
      },
    ],
  });
  const result = queryWrites(graph, "Account");
  assert.equal(result.ambiguous, true);
  assert.equal(result.writers.length, 0);
  assert.equal(result.candidates?.length, 2);
  assert.ok(result.limitations.some((item) => /exact resource id/i.test(item)));

  const byId = queryWrites(graph, left);
  assert.equal(byId.ambiguous, undefined);
  assert.equal(byId.resource.id, left);
});

test("query unknown reports unsupported Fastify without inventing endpoints", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-query-unknown-"));
  try {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "query-unknown",
        dependencies: { fastify: "5.0.0" },
      }),
      "utf8",
    );
    await writeFile(
      path.join(root, "src", "app.ts"),
      [
        'import Fastify from "fastify";',
        "const app = Fastify();",
        'app.get("/x", async () => 1);',
        "",
      ].join("\n"),
      "utf8",
    );
    const graph = await compileRepository(root);
    const result = queryUnknown(graph);
    assert.equal(result.query, "unknown");
    assert.ok(
      result.unsupported.some((item) => /fastify/i.test(item.message)),
    );
    assert.equal(
      graph.nodes.some((node) =>
        node.semantics?.some((facet) => facet.kind === "endpoint"),
      ),
      false,
    );
    assert.ok(result.totals.unsupported >= 1);
    assert.equal(result.unsupported.length, result.totals.unsupported);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("query unknown reports totals and truncation instead of claiming completeness", () => {
  const diagnostics = Array.from({ length: 45 }, (_, index) => ({
    severity: "info",
    code: "call-unresolved",
    message: `Unresolved call to missing${index}`,
    evidence: { file: "src/app.ts", certainty: "observed" },
  }));
  const graph = syntheticGraph({ diagnostics });
  const result = queryUnknown(graph, { limit: 10 });
  assert.equal(result.totals.unresolvedCalls, 45);
  assert.equal(result.unresolvedCalls.length, 10);
  assert.equal(result.truncated.unresolvedCalls, true);
  assert.ok(result.limitations.some((item) => /truncated/i.test(item)));
  assert.ok(result.graph.generatedAt);

  const full = queryUnknown(graph, { limit: 0 });
  assert.equal(full.truncated.unresolvedCalls, false);
  assert.equal(full.unresolvedCalls.length, 45);
});

test("loadArchitectureGraph treats a cache without a fingerprint as stale", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-query-nofp-"));
  try {
    await writeExpressPackage(root, "query-nofp");
    await writeFile(
      path.join(root, "src", "app.ts"),
      "export function ping() { return 1; }\n",
      "utf8",
    );
    const first = await compileRepository(root);
    const output = path.join(root, ".underdelta");
    await mkdir(output, { recursive: true });
    await writeFile(
      path.join(output, "architecture.json"),
      `${JSON.stringify(first, null, 2)}\n`,
      "utf8",
    );
    const loaded = await loadArchitectureGraph(root, { output: ".underdelta" });
    assert.equal(loaded.source, "compiled");
    assert.ok(await readCacheFingerprint(output));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadArchitectureGraph rejects a cache that no longer matches the tree", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-query-cache-"));
  try {
    await writeExpressPackage(root, "query-cache");
    await writeFile(
      path.join(root, "src", "app.ts"),
      "export function ping() { return 1; }\n",
      "utf8",
    );
    const first = await compileRepository(root);
    const output = path.join(root, ".underdelta");
    await persistArchitectureGraph(output, first, root);
    assert.ok(await readCacheFingerprint(output));

    const cached = await loadArchitectureGraph(root, { output: ".underdelta" });
    assert.equal(cached.source, "cache");
    assert.equal(cached.graph.generatedAt, first.generatedAt);

    await writeFile(
      path.join(root, "src", "app.ts"),
      "export function ping() { return 1; }\nexport function pong() { return 2; }\n",
      "utf8",
    );
    const refreshed = await loadArchitectureGraph(root, {
      output: ".underdelta",
    });
    assert.equal(refreshed.source, "compiled");
    assert.notEqual(refreshed.graph.generatedAt, first.generatedAt);
    assert.ok(
      refreshed.graph.nodes.some(
        (node) => node.kind === "function" && node.label === "pong",
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
