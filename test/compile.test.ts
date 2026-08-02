import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileRepository } from "../src/compile.js";
import { architectureGraphSchema } from "../src/schema.js";
import { renderArchitectureHtml } from "../src/viewer.js";

const fixture = path.join(import.meta.dirname, "fixtures", "shop");

describe("compileRepository", () => {
  it("builds a typed, evidence-backed product model", async () => {
    const graph = await compileRepository(fixture);

    expect(() => architectureGraphSchema.parse(graph)).not.toThrow();
    expect(graph.nodes.some((node) => node.kind === "component")).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "hook")).toBe(true);
    expect(
      graph.nodes.some(
        (node) => node.kind === "route" && node.label === "POST /checkout",
      ),
    ).toBe(true);
    expect(
      graph.nodes.some(
        (node) => node.kind === "cron" && node.label === "0 * * * *",
      ),
    ).toBe(true);
    expect(
      graph.nodes.some(
        (node) => node.kind === "queue" && node.label === "payments",
      ),
    ).toBe(true);
    expect(
      graph.nodes.some(
        (node) => node.kind === "table" && node.label === "Order",
      ),
    ).toBe(true);
    expect(
      graph.nodes.some(
        (node) => node.kind === "table" && node.label === "audit_log",
      ),
    ).toBe(true);

    const edgeKinds = new Set(graph.edges.map((edge) => edge.kind));
    for (const kind of [
      "renders",
      "reads",
      "writes",
      "routes-to",
      "schedules",
      "consumes",
      "migrates",
    ] as const) {
      expect(edgeKinds.has(kind), `missing ${kind} edge`).toBe(true);
    }
    expect(
      graph.nodes.every(
        (node) =>
          node.evidence.length > 0 &&
          node.evidence.every((entry) => entry.file.length > 0),
      ),
    ).toBe(true);
  });

  it("renders a portable visual browser", async () => {
    const graph = await compileRepository(fixture);
    const html = renderArchitectureHtml(graph);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Source evidence");
    expect(html).toContain("POST /checkout");
    expect(html).toContain("Prisma database");
    expect(html).not.toContain("https://");
  });
});
