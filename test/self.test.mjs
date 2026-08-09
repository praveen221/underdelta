import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compileRepository } from "../dist/compile.js";
import { architectureGraphSchema } from "../dist/schema.js";
import { renderArchitectureHtml } from "../dist/viewer.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registeredExtractors = [
  "typescript",
  "python",
  "mongo",
  "openapi",
  "graphql",
  "docker",
  "terraform",
  "kubernetes",
  "kustomize",
  "helm",
  "prisma",
  "sql",
];

test("Underdelta compiles its own structural compiler story", async () => {
  const graph = await compileRepository(repoRoot);
  architectureGraphSchema.parse(graph);

  assert.deepEqual(
    graph.extractors.map((extractor) => extractor.id).sort(),
    ["repository", ...registeredExtractors].sort(),
  );

  for (const modulePath of [
    "src/cli.ts",
    "src/compile.ts",
    "src/schema.ts",
    "src/graph.ts",
    "src/project.ts",
    "src/viewer.ts",
  ]) {
    assert.ok(
      graph.nodes.some((node) => node.kind === "module" && node.label === modulePath),
      `self-map should include ${modulePath}`,
    );
  }

  for (const extractor of registeredExtractors) {
    assert.ok(
      graph.nodes.some(
        (node) => node.technology === extractor || node.metadata?.extractorId === extractor,
      ),
      `self-map should represent registered ${extractor} extractor`,
    );
  }

  assert.equal(
    graph.nodes.some((node) => /(^|\/)verification\//.test(node.label)),
    false,
    "verification inputs must not become product architecture",
  );
  assert.equal(
    graph.nodes.some((node) => node.label.includes(".underdelta-real")),
    false,
    "real-repository cache must not become product architecture",
  );

  const html = renderArchitectureHtml(graph);
  assert.match(html, /id="tier"/);
  assert.match(html, /underdelta:walk:/);
});
