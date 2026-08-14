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
const registeredAdapters = [
  "data-resources",
  "deploy-units",
  "http-endpoints",
  "http-flask",
  "http-unsupported",
  "scheduled-node",
  "scheduled-celery",
  "scheduled-kubernetes",
  "scheduled-unsupported",
];

test("Underdelta compiles its own structural compiler story", async () => {
  const graph = await compileRepository(repoRoot);
  architectureGraphSchema.parse(graph);

  assert.deepEqual(
    graph.extractors.map((extractor) => extractor.id).sort(),
    ["repository", ...registeredExtractors].sort(),
  );
  assert.deepEqual(
    graph.adapters.map((adapter) => adapter.id).sort(),
    registeredAdapters.sort(),
  );

  for (const modulePath of [
    "src/cli.ts",
    "src/analysis.ts",
    "src/compile.ts",
    "src/schema.ts",
    "src/graph.ts",
    "src/project.ts",
    "src/adapter.ts",
    "src/adapters/data/resources.ts",
    "src/adapters/deploy/units.ts",
    "src/adapters/http/endpoints.ts",
    "src/adapters/http/flask.ts",
    "src/adapters/http/unsupported.ts",
    "src/adapters/scheduled/node.ts",
    "src/projection/data.ts",
    "src/projection/deploy.ts",
    "src/projection/http.ts",
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

  for (const adapter of registeredAdapters) {
    assert.ok(
      graph.nodes.some(
        (node) =>
          node.technology === adapter || node.metadata?.adapterId === adapter,
      ),
      `self-map should represent registered ${adapter} adapter`,
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
  assert.match(html, /kindCluster/);
  assert.match(html, /clusterMemberVisible/);
  assert.match(html, /routeGroupNested/);
  assert.match(html, /clusterWalkAncestors/);
  assert.match(html, /isOperationStoryEdge/);
  assert.match(html, /operationBadgeLabel/);
  assert.match(html, /isHallwayTable/);
  assert.match(html, /visibleRouteStoriesTo/);
  assert.match(html, /isMigrationSchemaLeaf/);
  assert.match(html, /isDataRoomApiLeftover/);
  assert.match(html, /isTableFocusOperationRoute/);
  assert.match(html, /TABLE_FOCUS_ROUTE_CAP/);
});
