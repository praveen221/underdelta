import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { compileRepository } from "../dist/compile.js";
import {
  queryImpactFromGraph,
  queryUnknown,
  queryWrites,
} from "../dist/query.js";

test("query writes lists typed endpoint writers for a Prisma table", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-query-writes-"));
  try {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "query-writes",
        dependencies: { express: "4.21.0" },
      }),
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
    const result = queryWrites(graph, "order");
    assert.equal(result.query, "writes");
    assert.equal(result.resource.label, "order");
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

test("query impact on a service file reports the writing endpoint", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-query-impact-"));
  try {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "query-impact",
        dependencies: { express: "4.21.0" },
      }),
      "utf8",
    );
    await writeFile(
      path.join(root, "src", "billing.ts"),
      [
        "export function calculateTotal() {",
        "  return prisma.order.create({});",
        "}",
        "export function checkout() { return calculateTotal(); }",
        'app.post("/checkout", checkout);',
        "",
      ].join("\n"),
      "utf8",
    );
    const graph = await compileRepository(root);
    const result = queryImpactFromGraph(graph, ["src/billing.ts"]);
    assert.equal(result.query, "impact");
    assert.ok(
      result.report.impact.endpoints.some(
        (endpoint) =>
          endpoint.method === "POST" && endpoint.path === "/checkout",
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
      result.unsupported.some((item) =>
        /fastify/i.test(item.message),
      ),
    );
    assert.equal(
      graph.nodes.some((node) =>
        node.semantics?.some((facet) => facet.kind === "endpoint"),
      ),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
