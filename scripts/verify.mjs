#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileRepository } from "../dist/compile.js";
import { renderArchitectureHtml } from "../dist/viewer.js";
import {
  ensureRealRepo,
  FASTAPI_REALWORLD,
  GRAPHQL_CLIENT_EXAMPLE_SERVER,
  HACKATHON_STARTER,
  NEXTJS_SAAS_STARTER,
  REALWORLD_EXPRESS,
  SWAGGER_PETSTORE,
} from "./ensure-real-repo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const fixtureRoot = path.join(repoRoot, "verification", "mini-stack");
const miniNextRoot = path.join(repoRoot, "verification", "mini-next");
const miniPythonRoot = path.join(repoRoot, "verification", "mini-python");
const miniMongoRoot = path.join(repoRoot, "verification", "mini-mongo");
const miniOpenapiRoot = path.join(repoRoot, "verification", "mini-openapi");
const miniGraphqlRoot = path.join(repoRoot, "verification", "mini-graphql");

function fail(message) {
  console.error(`VERIFY FAIL: ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`VERIFY OK: ${message}`);
}

function countByKind(nodes) {
  const counts = new Map();
  for (const node of nodes) {
    counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
  }
  return counts;
}

function requireKind(counts, kind, minimum = 1) {
  const actual = counts.get(kind) ?? 0;
  if (actual < minimum) {
    fail(`expected at least ${minimum} '${kind}' node(s), found ${actual}`);
    return;
  }
  pass(`found ${actual} '${kind}' node(s)`);
}

function requireEdge(edges, kind, minimum = 1) {
  const actual = edges.filter((edge) => edge.kind === kind).length;
  if (actual < minimum) {
    fail(`expected at least ${minimum} '${kind}' edge(s), found ${actual}`);
    return;
  }
  pass(`found ${actual} '${kind}' edge(s)`);
}

const fixtureGraph = await compileRepository(fixtureRoot);
const fixtureCounts = countByKind(fixtureGraph.nodes);

console.log(
  `Fixture graph: ${fixtureGraph.nodes.length} nodes, ${fixtureGraph.edges.length} edges`,
);

requireKind(fixtureCounts, "route", 2);
requireKind(fixtureCounts, "cron", 1);
requireKind(fixtureCounts, "queue", 1);
requireKind(fixtureCounts, "pipeline", 1);
requireKind(fixtureCounts, "pipeline-step", 3);
requireKind(fixtureCounts, "database", 1);
requireKind(fixtureCounts, "table", 2);
requireKind(fixtureCounts, "schema", 1);
requireKind(fixtureCounts, "component", 1);
requireEdge(fixtureGraph.edges, "schedules", 1);
requireEdge(fixtureGraph.edges, "routes-to", 1);
requireEdge(fixtureGraph.edges, "flows-to", 2);
requireEdge(fixtureGraph.edges, "reads", 1);
requireEdge(fixtureGraph.edges, "writes", 1);
requireEdge(fixtureGraph.edges, "publishes", 1);
requireEdge(fixtureGraph.edges, "consumes", 1);

const routeLabels = new Set(
  fixtureGraph.nodes.filter((node) => node.kind === "route").map((node) => node.label),
);
if (!routeLabels.has("POST /checkout") || !routeLabels.has("GET /health")) {
  fail(`missing expected routes; found ${[...routeLabels].join(", ") || "(none)"}`);
} else {
  pass("checkout and health routes present");
}

const productGraph = await compileRepository(repoRoot);
const leaked = productGraph.nodes.flatMap((node) =>
  node.evidence
    .filter((item) => {
      const file = item.file.replaceAll("\\", "/");
      return (
        file === "verification" ||
        file.startsWith("verification/") ||
        file.includes("/verification/") ||
        file.includes("mini-stack/") ||
        file.includes("mini-next/") ||
        file.includes("mini-python/") ||
        file.includes("mini-mongo/") ||
        file.includes("mini-openapi/") ||
        file.includes("mini-graphql/") ||
        file === ".underdelta-real" ||
        file.startsWith(".underdelta-real/") ||
        file.includes("/.underdelta-real/")
      );
    })
    .map((item) => `${node.kind}:${node.label} <- ${item.file}`),
);

if (leaked.length > 0) {
  fail(
    `default product scan leaked verification/real-repo evidence:\n  ${leaked.slice(0, 20).join("\n  ")}`,
  );
} else {
  pass("default product scan excludes verification/ and .underdelta-real/");
}

const selfGraph = productGraph;

// Golden summary for `scan .` on Underdelta itself: counts + required labels.
// Floors catch product-story regressions without freezing exact graph size.
const SELF_GOLDEN = {
  requiredLabels: [
    "CLI",
    "Compile pipeline",
    "Extractors",
    "Graph assembly",
    "Schema contract",
    "Viewer",
    "architecture.json",
    "index.html",
  ],
  min: {
    nodes: 40,
    edges: 80,
    semantic: 8,
    flowOrdered: 8,
    product: 1,
    system: 4,
    pipeline: 1,
    ui: 1,
    config: 2,
    "flows-to": 8,
    contains: 40,
  },
};

const selfCounts = countByKind(selfGraph.nodes);
const selfEdgeCounts = countByKind(selfGraph.edges);
const selfSemantic = selfGraph.nodes.filter(
  (node) => node.metadata?.projection === "semantic",
);
const selfFlowOrdered = selfGraph.nodes
  .filter((node) => typeof node.metadata?.flowOrder === "number")
  .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
const selfProduct = selfGraph.nodes.find((node) => node.kind === "product");
const goldenSummary = {
  product: selfProduct?.label ?? "(missing)",
  nodes: selfGraph.nodes.length,
  edges: selfGraph.edges.length,
  semantic: selfSemantic.length,
  flowOrder: selfFlowOrdered.map((node) => node.label),
  labels: [...new Set(selfSemantic.map((node) => node.label))].sort(),
  kinds: Object.fromEntries(
    [...selfCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  ),
  edgeKinds: Object.fromEntries(
    [...selfEdgeCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  ),
};
console.log(`Underdelta golden summary: ${JSON.stringify(goldenSummary)}`);

if (goldenSummary.nodes < SELF_GOLDEN.min.nodes) {
  fail(
    `golden nodes below floor: ${goldenSummary.nodes} < ${SELF_GOLDEN.min.nodes}`,
  );
} else {
  pass(`golden nodes: ${goldenSummary.nodes}`);
}
if (goldenSummary.edges < SELF_GOLDEN.min.edges) {
  fail(
    `golden edges below floor: ${goldenSummary.edges} < ${SELF_GOLDEN.min.edges}`,
  );
} else {
  pass(`golden edges: ${goldenSummary.edges}`);
}
if (goldenSummary.semantic < SELF_GOLDEN.min.semantic) {
  fail(
    `golden semantic systems below floor: ${goldenSummary.semantic} < ${SELF_GOLDEN.min.semantic}`,
  );
} else {
  pass(`golden semantic systems: ${goldenSummary.semantic}`);
}
if (selfFlowOrdered.length < SELF_GOLDEN.min.flowOrdered) {
  fail(
    `golden flowOrdered below floor: ${selfFlowOrdered.length} < ${SELF_GOLDEN.min.flowOrdered}`,
  );
} else {
  pass(`golden flowOrdered: ${selfFlowOrdered.length}`);
}
if (goldenSummary.product !== "underdelta") {
  fail(`golden product label expected 'underdelta', found '${goldenSummary.product}'`);
} else {
  pass("golden product label: underdelta");
}

for (const [kind, minimum] of Object.entries(SELF_GOLDEN.min)) {
  if (["nodes", "edges", "semantic", "flowOrdered"].includes(kind)) continue;
  const actual =
    kind === "flows-to" || kind === "contains"
      ? (selfEdgeCounts.get(kind) ?? 0)
      : (selfCounts.get(kind) ?? 0);
  if (actual < minimum) {
    fail(`golden '${kind}' below floor: ${actual} < ${minimum}`);
  } else {
    pass(`golden '${kind}': ${actual}`);
  }
}

const selfLabels = new Set(goldenSummary.labels);
for (const expected of SELF_GOLDEN.requiredLabels) {
  if (!selfLabels.has(expected)) {
    fail(`Underdelta self-map missing semantic node '${expected}'`);
  } else {
    pass(`self-map has '${expected}'`);
  }
}
const missingFlowLabels = SELF_GOLDEN.requiredLabels.filter(
  (label) => !goldenSummary.flowOrder.includes(label),
);
if (missingFlowLabels.length) {
  fail(
    `golden flowOrder missing labels: ${missingFlowLabels.join(", ")} (got ${goldenSummary.flowOrder.join(" → ")})`,
  );
} else {
  pass(`golden flowOrder: ${goldenSummary.flowOrder.join(" → ")}`);
}

// Map.get("cli") / systems.get("data") must not become Application routes.
const fakeHttpRoutes = selfGraph.nodes.filter(
  (node) =>
    node.kind === "route" &&
    typeof node.metadata?.path === "string" &&
    !String(node.metadata.path).startsWith("/") &&
    !String(node.metadata.path).startsWith("*"),
);
const mapGetRouteLabels = ["GET cli", "GET data", "GET extractors", "GET pipelines", "GET workers"];
const leakedMapGetRoutes = selfGraph.nodes.filter(
  (node) => node.kind === "route" && mapGetRouteLabels.includes(node.label),
);
if (fakeHttpRoutes.length || leakedMapGetRoutes.length) {
  fail(
    `self-map has false-positive HTTP routes from non-path .get/.post calls: ${[
      ...new Set([
        ...fakeHttpRoutes.map((node) => node.label),
        ...leakedMapGetRoutes.map((node) => node.label),
      ]),
    ].join(", ")}`,
  );
} else {
  pass("self-map has no Map.get-style false-positive HTTP routes");
}

// Mongo maskComments must treat /regex/ literals so JSDoc/line comments in
// src/extractors/mongo.ts (and project.ts docs) cannot invent collections.
const selfMongoCommentNoise = selfGraph.nodes.filter(
  (node) =>
    (node.kind === "collection" || node.label === "MongoDB") &&
    (node.evidence ?? []).some(
      (item) =>
        item.extractor === "mongo" &&
        (item.file === "src/extractors/mongo.ts" ||
          item.file === "src/project.ts"),
    ),
);
if (selfMongoCommentNoise.length) {
  fail(
    `self-map has mongo comment-noise nodes (maskComments regex-literal bug): ${selfMongoCommentNoise
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("self-map has no mongo extractor comment-noise collections/MongoDB hubs");
}

const artifact = selfGraph.nodes.find(
  (node) =>
    node.label === "architecture.json" && node.metadata?.role === "artifact",
);
if (!artifact) {
  fail("missing architecture.json artifact node with role=artifact");
} else {
  pass("architecture.json artifact node present");
}

const browser = selfGraph.nodes.find(
  (node) =>
    node.label === "index.html" &&
    node.metadata?.role === "artifact" &&
    node.metadata?.artifactKind === "browser",
);
if (!browser) {
  fail("missing index.html browser artifact node");
} else {
  pass("index.html browser artifact node present");
}

const flowOrdered = selfGraph.nodes.filter(
  (node) => typeof node.metadata?.flowOrder === "number",
);
if (flowOrdered.length < 5) {
  fail(`expected flowOrder on self-map systems, found ${flowOrdered.length}`);
} else {
  const orderedLabels = [...flowOrdered]
    .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder)
    .map((node) => node.label);
  pass(`self-map flowOrder: ${orderedLabels.join(" → ")}`);
  if (!orderedLabels.includes("architecture.json") || !orderedLabels.includes("index.html")) {
    fail("expected both scan artifacts in flowOrder band");
  } else {
    const irOrder = orderedLabels.indexOf("architecture.json");
    const browserOrder = orderedLabels.indexOf("index.html");
    if (browserOrder <= irOrder) {
      fail(
        `expected architecture.json before index.html in flow, got ${orderedLabels.join(" → ")}`,
      );
    } else {
      pass("scan artifacts ordered architecture.json → index.html");
    }
  }
}

const artifactFlow = selfGraph.edges.some(
  (edge) =>
    edge.kind === "flows-to" &&
    (edge.source === artifact?.id || edge.target === artifact?.id),
);
if (!artifactFlow) {
  fail("architecture.json artifact missing flows-to linkage");
} else {
  pass("architecture.json participates in product flow");
}

const browserFromArtifact = selfGraph.edges.some(
  (edge) =>
    edge.kind === "flows-to" &&
    edge.source === artifact?.id &&
    edge.target === browser?.id,
);
const browserFromViewer = selfGraph.edges.some(
  (edge) =>
    edge.kind === "flows-to" &&
    edge.target === browser?.id &&
    selfGraph.nodes.some(
      (node) =>
        node.id === edge.source &&
        node.label === "Viewer" &&
        node.metadata?.projection === "semantic",
    ),
);
if (!browserFromArtifact || !browserFromViewer) {
  fail(
    `index.html missing expected flows (artifact→browser=${browserFromArtifact}, viewer→browser=${browserFromViewer})`,
  );
} else {
  pass("index.html flows from architecture.json and Viewer");
}

function requireCollab(kind, fromLabel, toLabel, detailSnippet) {
  const from = selfGraph.nodes.find(
    (node) =>
      node.label === fromLabel && node.metadata?.projection === "semantic",
  );
  const to = selfGraph.nodes.find(
    (node) =>
      node.label === toLabel && node.metadata?.projection === "semantic",
  );
  const edge =
    from &&
    to &&
    selfGraph.edges.find(
      (item) =>
        item.kind === kind && item.source === from.id && item.target === to.id,
    );
  if (!edge) {
    fail(`missing collaboration edge ${fromLabel} -[${kind}]-> ${toLabel}`);
    return;
  }
  if (detailSnippet) {
    const detail =
      (edge.evidence || []).find((item) => item.detail)?.detail || "";
    if (!detail.includes(detailSnippet)) {
      fail(
        `collaboration ${fromLabel} -[${kind}]-> ${toLabel} missing detail ${JSON.stringify(detailSnippet)} (got ${JSON.stringify(detail)})`,
      );
      return;
    }
  }
  pass(`collaboration: ${fromLabel} -[${kind}]-> ${toLabel}`);
}

requireCollab(
  "uses",
  "Compile pipeline",
  "Extractors",
  "Compile pipeline uses language extractors",
);
requireCollab(
  "uses",
  "Compile pipeline",
  "Graph assembly",
  "Compile pipeline uses graph assembly",
);
requireCollab(
  "uses",
  "Compile pipeline",
  "Schema contract",
  "validates against the schema contract",
);
requireCollab(
  "renders",
  "Viewer",
  "Graph assembly",
  "Viewer renders the assembled architecture graph",
);
requireCollab(
  "renders",
  "Viewer",
  "architecture.json",
  "Viewer renders architecture.json into the browser",
);
requireCollab(
  "exposes",
  "CLI",
  "architecture.json",
  "CLI scan writes the architecture IR artifact",
);
requireCollab(
  "exposes",
  "CLI",
  "index.html",
  "CLI scan writes the self-contained browser artifact",
);
requireCollab(
  "triggers",
  "CLI",
  "Compile pipeline",
  "CLI scan command triggers the compile pipeline",
);
requireCollab(
  "configures",
  "Schema contract",
  "Extractors",
  "Schema contract configures extractor output shape",
);

const cli = selfGraph.nodes.find(
  (node) => node.label === "CLI" && node.metadata?.projection === "semantic",
);
const binCommands = Array.isArray(cli?.metadata?.binCommands)
  ? cli.metadata.binCommands
  : [];
if (!cli || !binCommands.includes("underdelta")) {
  fail(
    `expected CLI binCommands to include underdelta, found ${JSON.stringify(binCommands)}`,
  );
} else {
  pass(`CLI binCommands: ${binCommands.join(", ")}`);
}

const cliKeyFiles = Array.isArray(cli?.metadata?.keyFiles)
  ? cli.metadata.keyFiles
  : [];
if (
  !cliKeyFiles.includes("src/cli.ts") ||
  !cliKeyFiles.includes("package.json")
) {
  fail(
    `expected CLI keyFiles to include src/cli.ts and package.json, found ${JSON.stringify(cliKeyFiles)}`,
  );
} else {
  pass(`CLI keyFiles: ${cliKeyFiles.join(", ")}`);
}

const extractorsSystem = selfGraph.nodes.find(
  (node) =>
    node.label === "Extractors" && node.metadata?.projection === "semantic",
);
const extractorRoster = Array.isArray(extractorsSystem?.metadata?.extractorRoster)
  ? extractorsSystem.metadata.extractorRoster
  : [];
const requiredExtractors = [
  "graphql",
  "mongo",
  "openapi",
  "prisma",
  "python",
  "sql",
  "typescript",
];
const missingExtractors = requiredExtractors.filter(
  (id) => !extractorRoster.includes(id),
);
if (!extractorsSystem || missingExtractors.length > 0) {
  fail(
    `expected Extractors.extractorRoster to include ${requiredExtractors.join(", ")}, found ${JSON.stringify(extractorRoster)}`,
  );
} else {
  pass(`Extractors roster: ${extractorRoster.join(", ")}`);
}

const extractorKeyFiles = Array.isArray(extractorsSystem?.metadata?.keyFiles)
  ? extractorsSystem.metadata.keyFiles
  : [];
const requiredExtractorFiles = [
  "src/extractors/graphql.ts",
  "src/extractors/mongo.ts",
  "src/extractors/openapi.ts",
  "src/extractors/prisma.ts",
  "src/extractors/python.ts",
  "src/extractors/sql.ts",
  "src/extractors/typescript.ts",
];
const missingExtractorFiles = requiredExtractorFiles.filter(
  (file) => !extractorKeyFiles.includes(file),
);
if (missingExtractorFiles.length > 0) {
  fail(
    `expected Extractors keyFiles to include language extractors, missing ${JSON.stringify(missingExtractorFiles)}; found ${JSON.stringify(extractorKeyFiles)}`,
  );
} else {
  pass(`Extractors keyFiles: ${extractorKeyFiles.join(", ")}`);
}

const extractorChildren = selfGraph.nodes.filter(
  (node) =>
    node.parentId === extractorsSystem?.id &&
    node.metadata?.role === "extractor" &&
    requiredExtractors.includes(node.label),
);
if (extractorChildren.length < requiredExtractors.length) {
  fail(
    `expected Extractors child labels ${requiredExtractors.join(", ")}, found ${JSON.stringify(extractorChildren.map((node) => node.label))}`,
  );
} else {
  pass(
    `Extractors child labels: ${extractorChildren.map((node) => node.label).sort().join(", ")}`,
  );
}

const systemsWithKeyFiles = selfGraph.nodes.filter(
  (node) =>
    node.metadata?.projection === "semantic" &&
    Array.isArray(node.metadata.keyFiles) &&
    node.metadata.keyFiles.length > 0,
);
if (systemsWithKeyFiles.length < 5) {
  fail(
    `expected keyFiles on semantic systems, found ${systemsWithKeyFiles.length}`,
  );
} else {
  pass(`semantic systems with keyFiles: ${systemsWithKeyFiles.length}`);
}

const fixtureSystems = fixtureGraph.nodes.filter(
  (node) => node.metadata?.projection === "semantic",
);
if (fixtureSystems.length < 3) {
  fail(
    `expected semantic projection on fixture (3+ systems), found ${fixtureSystems.length}`,
  );
} else {
  pass(`fixture semantic systems: ${fixtureSystems.length}`);
}

const fixtureByKey = new Map(
  fixtureSystems
    .filter((node) => typeof node.metadata?.systemKey === "string")
    .map((node) => [node.metadata.systemKey, node]),
);
const expectedReadmeLabels = {
  ui: "Storefront UI",
  api: "Checkout API",
  pipelines: "Order pipeline",
  workers: "Fulfillment workers",
  jobs: "Reconciliation jobs",
  data: "Catalog data",
};
for (const [key, expected] of Object.entries(expectedReadmeLabels)) {
  const system = fixtureByKey.get(key);
  if (!system) {
    fail(`fixture self-map missing semantic systemKey '${key}'`);
  } else if (system.label !== expected) {
    fail(
      `fixture system '${key}' label expected '${expected}' from README, found '${system.label}'`,
    );
  } else if (system.metadata?.labelSource !== "readme") {
    fail(
      `fixture system '${key}' should record labelSource=readme, found ${JSON.stringify(system.metadata?.labelSource ?? null)}`,
    );
  } else {
    pass(`fixture has README label '${expected}' (${key})`);
  }
}

const fixtureFlowOrdered = fixtureSystems
  .filter((node) => typeof node.metadata?.flowOrder === "number")
  .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
const fixtureFlowLabels = fixtureFlowOrdered.map((node) => node.label);
const expectedFixtureFlow = Object.values(expectedReadmeLabels);
// Product-story order by systemKey (labels may be README-refined).
const expectedFixtureFlowKeys = [
  "ui",
  "api",
  "pipelines",
  "workers",
  "jobs",
  "data",
];
if (fixtureFlowOrdered.length < expectedFixtureFlowKeys.length) {
  fail(
    `expected fixture Product flow band (>=${expectedFixtureFlowKeys.length}), found ${fixtureFlowOrdered.length}`,
  );
} else {
  pass(`fixture flowOrdered: ${fixtureFlowOrdered.length}`);
}
const fixtureFlowKeys = fixtureFlowOrdered.map(
  (node) => node.metadata.systemKey,
);
const missingFixtureFlow = expectedFixtureFlowKeys.filter(
  (key) => !fixtureFlowKeys.includes(key),
);
if (missingFixtureFlow.length) {
  fail(
    `fixture flowOrder missing keys: ${missingFixtureFlow.join(", ")} (got ${fixtureFlowLabels.join(" → ")})`,
  );
} else {
  const positions = expectedFixtureFlowKeys.map((key) =>
    fixtureFlowKeys.indexOf(key),
  );
  const inOrder = positions.every(
    (pos, index) => index === 0 || pos > positions[index - 1],
  );
  if (!inOrder) {
    fail(
      `fixture flowOrder not left-to-right product story: ${fixtureFlowLabels.join(" → ")} (want ${expectedFixtureFlow.join(" → ")})`,
    );
  } else {
    pass(`fixture flowOrder: ${fixtureFlowLabels.join(" → ")}`);
  }
}

const apiSystem = fixtureByKey.get("api");
const jobsSystem = fixtureByKey.get("jobs");
const apiToJobsFlow = fixtureGraph.edges.some(
  (edge) =>
    edge.kind === "flows-to" &&
    edge.source === apiSystem?.id &&
    edge.target === jobsSystem?.id,
);
if (!apiToJobsFlow) {
  fail("expected Checkout API → Reconciliation jobs flows-to for fixture Product flow");
} else {
  pass("Checkout API flows-to Reconciliation jobs");
}

function requireFixtureCollab(kind, fromKey, toKey, detailSnippet) {
  const from = fixtureByKey.get(fromKey);
  const to = fixtureByKey.get(toKey);
  const edge =
    from &&
    to &&
    fixtureGraph.edges.find(
      (item) =>
        item.kind === kind && item.source === from.id && item.target === to.id,
    );
  if (!edge) {
    fail(
      `missing fixture collaboration ${from?.label ?? fromKey} -[${kind}]-> ${to?.label ?? toKey}`,
    );
    return;
  }
  if (detailSnippet) {
    const detail =
      (edge.evidence || []).find((item) => item.detail)?.detail || "";
    if (!detail.includes(detailSnippet)) {
      fail(
        `fixture collaboration ${from.label} -[${kind}]-> ${to.label} missing detail ${JSON.stringify(detailSnippet)} (got ${JSON.stringify(detail)})`,
      );
      return;
    }
  }
  pass(
    `fixture collaboration: ${from.label} -[${kind}]-> ${to.label}`,
  );
}

requireFixtureCollab(
  "uses",
  "ui",
  "api",
  "Storefront UI uses Checkout API",
);
requireFixtureCollab(
  "triggers",
  "api",
  "pipelines",
  "Checkout API triggers the Order pipeline",
);
requireFixtureCollab(
  "triggers",
  "api",
  "workers",
  "Checkout API triggers Fulfillment workers",
);
requireFixtureCollab(
  "reads",
  "api",
  "data",
  "Checkout API reads Catalog data",
);
requireFixtureCollab(
  "uses",
  "jobs",
  "data",
  "Reconciliation jobs use Catalog data",
);

const fixtureTables = fixtureGraph.nodes.filter((node) => node.kind === "table");
// After projection, Order/order/orders and Payment/payment/payments collapse.
if (fixtureTables.length !== 2) {
  fail(
    `expected exactly 2 unified tables, found ${fixtureTables.length}: ${fixtureTables
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass(`fixture tables unified to ${fixtureTables.length}`);
}

const tableLabels = new Set(fixtureTables.map((node) => node.label));
if (!tableLabels.has("Order") || !tableLabels.has("Payment")) {
  fail(
    `expected Prisma-facing table labels Order + Payment, found ${[...tableLabels].join(", ")}`,
  );
} else {
  pass("table labels prefer Prisma names (Order, Payment)");
}

for (const table of fixtureTables) {
  const sqlName = table.metadata?.sqlName;
  const sources = table.metadata?.sources;
  if (!sqlName || !Array.isArray(sources) || !sources.includes("prisma") || !sources.includes("sql")) {
    fail(
      `expected table ${table.label} to record prisma+sql sources and sqlName, got sqlName=${sqlName} sources=${JSON.stringify(sources)}`,
    );
  }
}
pass("unified tables record prismaName/sqlName sources");

const migration = fixtureGraph.nodes.find(
  (node) => node.kind === "schema" && String(node.label).includes("migrations/"),
);
const migratesToTables = fixtureGraph.edges.filter((edge) => {
  if (edge.kind !== "migrates" || edge.source !== migration?.id) return false;
  return fixtureTables.some((table) => table.id === edge.target);
});
const migratedLabels = new Set(
  migratesToTables.map(
    (edge) => fixtureTables.find((table) => table.id === edge.target)?.label,
  ),
);
if (!migratedLabels.has("Order") || !migratedLabels.has("Payment")) {
  fail(
    `expected migrates edges from SQL migration to Order + Payment, found ${[...migratedLabels].join(", ") || "(none)"}`,
  );
} else {
  pass("SQL migration migrates → unified Order + Payment tables");
}

const tableRelation = fixtureGraph.edges.find((edge) => {
  if (edge.kind !== "depends-on") return false;
  const source = fixtureTables.find((table) => table.id === edge.source);
  const target = fixtureTables.find((table) => table.id === edge.target);
  return (
    (source?.label === "Payment" && target?.label === "Order") ||
    (source?.label === "Order" && target?.label === "Payment")
  );
});
if (!tableRelation) {
  fail("expected table relation edge between Payment and Order");
} else if (!tableRelation.label || tableRelation.label === "depends-on") {
  fail(
    `expected named table↔table relation label (payments/order), got ${JSON.stringify(tableRelation.label)}`,
  );
} else {
  pass(
    `table relation: ${fixtureTables.find((t) => t.id === tableRelation.source)?.label} → ${fixtureTables.find((t) => t.id === tableRelation.target)?.label} via ${tableRelation.label}`,
  );
}

const relationOnlyColumns = fixtureGraph.nodes.filter(
  (node) => node.kind === "column" && node.metadata?.relation === true,
);
const collapsedRelationFields = relationOnlyColumns.filter(
  (node) =>
    node.metadata?.relationOnly === true &&
    node.metadata?.collapsedInOverview === true,
);
const relationFieldLabels = new Set(
  relationOnlyColumns.map((node) => String(node.label)),
);
if (relationOnlyColumns.length < 2) {
  fail(
    `expected Prisma relation fields (order/payments) on fixture columns, found ${relationOnlyColumns.length}`,
  );
} else if (collapsedRelationFields.length !== relationOnlyColumns.length) {
  fail(
    "relation-only Prisma fields should be marked relationOnly + collapsedInOverview",
  );
} else if (!relationFieldLabels.has("order") || !relationFieldLabels.has("payments")) {
  fail(
    `expected order + payments relation fields, found ${[...relationFieldLabels].join(", ")}`,
  );
} else if (!tableRelation) {
  fail("collapsing relation fields must keep Payment↔Order table edges");
} else {
  pass(
    `relation-only Prisma fields collapsed (${collapsedRelationFields.length}); table↔table edges kept`,
  );
}

const dataAccess = fixtureByKey.get("data");
const tablesUnderProduct = fixtureGraph.edges.filter((edge) => {
  const product = fixtureGraph.nodes.find(
    (node) => node.kind === "product" && node.id === edge.source,
  );
  return (
    edge.kind === "contains" &&
    product &&
    fixtureTables.some((table) => table.id === edge.target)
  );
});
if (!dataAccess) {
  fail("expected Catalog data system for fixture tables");
} else if (tablesUnderProduct.length > 0) {
  fail("unified tables should not remain contained by product after Catalog data nesting");
} else {
  const nested = fixtureTables.every((table) => table.parentId === dataAccess.id);
  if (!nested) {
    fail("expected unified tables nested under Catalog data");
  } else {
    pass("unified tables nested under Catalog data (not product)");
  }
}

const dataLeaves = fixtureGraph.nodes.filter(
  (node) =>
    (node.kind === "database" || node.kind === "schema") &&
    node.parentId === dataAccess?.id,
);
const collapsedDataLeaves = dataLeaves.filter(
  (node) => node.metadata?.collapsedInOverview === true,
);
if (!dataAccess || dataLeaves.length < 2) {
  fail(
    `expected Prisma database + SQL migration under Catalog data, found ${dataLeaves
      .map((node) => `${node.kind}:${node.label}`)
      .join(", ") || "(none)"}`,
  );
} else if (collapsedDataLeaves.length !== dataLeaves.length) {
  fail(
    "database/schema leaves under Catalog data should be collapsedInOverview when tables tell the story",
  );
} else if (fixtureTables.some((table) => table.metadata?.collapsedInOverview === true)) {
  fail("unified tables should stay visible on overview under Catalog data");
} else {
  pass(
    `Catalog data overview collapses ${collapsedDataLeaves.length} database/schema leaf(ves); tables stay visible`,
  );
}

const fixtureColumns = fixtureGraph.nodes.filter((node) => node.kind === "column");
const columnsByTableKey = new Map();
for (const column of fixtureColumns) {
  const key = `${column.parentId}:${String(column.label).replaceAll("_", "").toLowerCase()}`;
  columnsByTableKey.set(key, (columnsByTableKey.get(key) ?? 0) + 1);
}
const duplicateColumns = [...columnsByTableKey.entries()].filter(
  ([, count]) => count > 1,
);
if (duplicateColumns.length > 0) {
  fail(
    `expected deduped columns after SQL+Prisma unify, found duplicates: ${duplicateColumns
      .map(([key]) => key)
      .join(", ")}`,
  );
} else {
  pass(`fixture columns deduped (${fixtureColumns.length} under unified tables)`);
}

const api = fixtureByKey.get("api");
const routesUnderApi =
  api &&
  fixtureGraph.edges.filter(
    (edge) =>
      edge.kind === "contains" &&
      edge.source === api.id &&
      fixtureGraph.nodes.some(
        (node) => node.id === edge.target && node.kind === "route",
      ),
  ).length;
if (!routesUnderApi) {
  fail("expected Checkout API system to contain route nodes");
} else {
  pass(`Checkout API contains ${routesUnderApi} route(s)`);
}

const cron = fixtureGraph.nodes.find((node) => node.kind === "cron");
if (
  !cron ||
  (!String(cron.label).includes("Reconcile payments") &&
    !String(cron.label).includes("reconcilePayments"))
) {
  fail(
    `expected humanized cron label with handler name, found '${cron?.label ?? "(none)"}'`,
  );
} else if (!String(cron.label).includes("every hour")) {
  fail(
    `expected cron schedule phrase 'every hour' (not raw cron), found '${cron.label}'`,
  );
} else if (/\b\d+\s+\*\s+\*\s+\*\s+\*/.test(String(cron.label))) {
  fail(`cron label still exposes raw cron expression: '${cron.label}'`);
} else {
  pass(`cron label humanized: ${cron.label}`);
}

if (!cron || cron.metadata?.scheduleHub !== true) {
  fail(
    `expected cron scheduleHub=true so jobs stay on the overview, found ${JSON.stringify(
      cron?.metadata ?? null,
    )}`,
  );
} else if (cron.metadata?.collapsedInOverview === true) {
  fail("cron schedule hub should stay visible on overview (like messaging hubs)");
} else {
  pass("cron schedule hub visible on overview");
}

const pipelines = fixtureByKey.get("pipelines");
const checkout = fixtureGraph.nodes.find(
  (node) =>
    node.kind === "pipeline" &&
    node.label === "checkout" &&
    node.metadata?.projection !== "semantic",
);
if (!pipelines || !checkout || checkout.parentId !== pipelines.id) {
  fail("expected extracted checkout pipeline nested under Order pipeline system");
} else {
  pass("checkout pipeline nested under Order pipeline");
}

const collapsedRoutes = fixtureGraph.nodes.filter(
  (node) => node.kind === "route" && node.metadata?.collapsedInOverview === true,
);
if (collapsedRoutes.length < 2) {
  fail(
    `expected routes collapsed in overview under Checkout API, found ${collapsedRoutes.length}`,
  );
} else {
  pass(`collapsed overview leaves: ${collapsedRoutes.length} route(s)`);
}

if (checkout && checkout.metadata?.collapsedInOverview !== true) {
  fail("expected checkout pipeline collapsed in overview under Order pipeline");
} else {
  pass("checkout pipeline collapsed in overview");
}

const fulfillmentQueue = fixtureGraph.nodes.find(
  (node) => node.kind === "queue" && node.label === "fulfillment",
);
if (!fulfillmentQueue || fulfillmentQueue.metadata?.messagingHub !== true) {
  fail(
    `expected fulfillment queue messagingHub=true, found ${JSON.stringify(
      fulfillmentQueue?.metadata ?? null,
    )}`,
  );
} else {
  pass("fulfillment queue marked as messaging hub");
}

if (fulfillmentQueue?.metadata?.collapsedInOverview === true) {
  fail("messaging hub queue should stay visible on overview");
} else {
  pass("fulfillment queue visible on overview");
}

const workers = fixtureByKey.get("workers");
const apiPublishes =
  api &&
  fulfillmentQueue &&
  fixtureGraph.edges.some(
    (edge) =>
      edge.kind === "publishes" &&
      edge.source === api.id &&
      edge.target === fulfillmentQueue.id,
  );
const workersConsume =
  workers &&
  fulfillmentQueue &&
  fixtureGraph.edges.some(
    (edge) =>
      edge.kind === "consumes" &&
      edge.source === workers.id &&
      edge.target === fulfillmentQueue.id,
  );
if (!apiPublishes) {
  fail("expected Checkout API system to publish to fulfillment queue");
} else {
  pass("Checkout API publishes to fulfillment");
}
if (!workersConsume) {
  fail("expected Fulfillment workers system to consume fulfillment queue");
} else {
  pass("Fulfillment workers consume fulfillment");
}

const fulfillmentPublishers = Array.isArray(fulfillmentQueue?.metadata?.publishers)
  ? fulfillmentQueue.metadata.publishers
  : [];
const fulfillmentConsumers = Array.isArray(fulfillmentQueue?.metadata?.consumers)
  ? fulfillmentQueue.metadata.consumers
  : [];
if (!fulfillmentPublishers.includes("Checkout API")) {
  fail(
    `expected fulfillment publishers to include Checkout API, found ${JSON.stringify(fulfillmentPublishers)}`,
  );
} else if (!fulfillmentConsumers.includes("Fulfillment workers")) {
  fail(
    `expected fulfillment consumers to include Fulfillment workers, found ${JSON.stringify(fulfillmentConsumers)}`,
  );
} else {
  pass(
    `fulfillment messaging roles: publishers=${fulfillmentPublishers.join(", ")}; consumers=${fulfillmentConsumers.join(", ")}`,
  );
}

// Inspector: collaboration edges (uses/renders/exposes/…) before raw imports,
// with human detail text (not just kind · label).
const viewerHtml = renderArchitectureHtml(selfGraph);
const collaborationHeading = viewerHtml.indexOf("<h3>Collaboration</h3>");
const importsHeading = viewerHtml.indexOf("Imports &amp; calls");
const collaborationKindsDecl = viewerHtml.indexOf(
  'const collaborationKinds = new Set([',
);
const usesInKinds = viewerHtml.indexOf('"uses"', collaborationKindsDecl);
const rendersInKinds = viewerHtml.indexOf('"renders"', collaborationKindsDecl);
const exposesInKinds = viewerHtml.indexOf('"exposes"', collaborationKindsDecl);
const readsInKinds = viewerHtml.indexOf('"reads"', collaborationKindsDecl);
const triggersInKinds = viewerHtml.indexOf('"triggers"', collaborationKindsDecl);
const importsFilter = viewerHtml.indexOf(
  "importsAndCalls = connections.filter",
);
const collaborationItemFn = viewerHtml.indexOf("function collaborationItem");
const edgeDetailTextFn = viewerHtml.indexOf("function edgeDetailText");
const collabDetailClass = viewerHtml.indexOf('class="collab-detail"');
const collabUsesCollaborationItem = viewerHtml.includes(
  "collaboration.slice(0, 16).map((edge) => collaborationItem(edge, id))",
);
if (
  collaborationKindsDecl < 0 ||
  usesInKinds < 0 ||
  rendersInKinds < 0 ||
  exposesInKinds < 0 ||
  readsInKinds < 0 ||
  triggersInKinds < 0
) {
  fail("viewer missing collaborationKinds set for inspector (uses/renders/exposes/triggers/reads)");
} else if (importsFilter < 0 || importsFilter < collaborationKindsDecl) {
  fail("viewer inspector should split importsAndCalls after collaborationKinds");
} else if (collaborationHeading < 0 || importsHeading < 0 || collaborationHeading > importsHeading) {
  // Headings are template strings inside selectNode; both must appear and Collaboration first.
  fail(
    `viewer inspector should render Collaboration before Imports & calls (collab=${collaborationHeading}, imports=${importsHeading})`,
  );
} else if (
  collaborationItemFn < 0 ||
  edgeDetailTextFn < 0 ||
  collabDetailClass < 0 ||
  !collabUsesCollaborationItem
) {
  fail(
    "viewer inspector should render collaboration edge detail text via collaborationItem/collab-detail",
  );
} else {
  pass("viewer inspector surfaces Collaboration detail text before Imports & calls");
}

// Canvas: collaboration edges styled apart from import/call hairlines.
const collabEdgeCss = viewerHtml.indexOf(".edge.collab");
const collabFlowsToCss = viewerHtml.indexOf(".edge.collab.flows-to");
const collabLegend = viewerHtml.indexOf('class="collab">collaboration');
const collabClassPush = viewerHtml.indexOf('classes.push("collab")');
const collabDataKind = viewerHtml.indexOf('path.setAttribute("data-kind", edge.kind)');
const collabKindsBeforeRender =
  viewerHtml.indexOf("const collaborationKinds = new Set([") <
    viewerHtml.indexOf("edgesLayer.innerHTML = \"\"") &&
  viewerHtml.indexOf("collaborationKinds.has(edge.kind)") >
    viewerHtml.indexOf("edgesLayer.innerHTML = \"\"");
if (
  collabEdgeCss < 0 ||
  collabFlowsToCss < 0 ||
  collabLegend < 0 ||
  collabClassPush < 0 ||
  collabDataKind < 0 ||
  !collabKindsBeforeRender
) {
  fail(
    "viewer canvas should style collaboration edges (.edge.collab / flows-to) distinctly from imports/calls",
  );
} else {
  pass("viewer canvas styles collaboration edges differently from imports/calls");
}

// Inspector: unified tables surface prismaName/sqlName + migration lineage.
const fixtureViewerHtml = renderArchitectureHtml(fixtureGraph);
const tableSourcesFn = fixtureViewerHtml.indexOf("function tableSourcesHtml");
const prismaSqlHeading = fixtureViewerHtml.indexOf("<h3>Prisma / SQL</h3>");
const prismaNamePill = fixtureViewerHtml.indexOf("prismaName:");
const sqlNamePill = fixtureViewerHtml.indexOf("sqlName:");
const tableMigrationsClass = fixtureViewerHtml.indexOf('class="table-migrations"');
const migratesOwnedByTable =
  fixtureViewerHtml.includes('node.kind === "table" && edge.kind === "migrates"');
if (tableSourcesFn < 0 || prismaSqlHeading < 0) {
  fail("viewer inspector missing Prisma / SQL section for unified tables");
} else if (prismaNamePill < 0 || sqlNamePill < 0) {
  fail("viewer inspector should render prismaName/sqlName pills for tables");
} else if (tableMigrationsClass < 0 || !migratesOwnedByTable) {
  fail(
    "viewer inspector should surface migration links under Prisma / SQL (not Imports & calls)",
  );
} else {
  pass("viewer inspector surfaces migration + sqlName/prismaName on unified tables");
}

// Viewer keeps relation-only Prisma fields collapsed unless searched.
const relationOnlyHide = fixtureViewerHtml.indexOf(
  "node.metadata.relationOnly",
);
if (relationOnlyHide < 0) {
  fail("viewer should hide metadata.relationOnly columns on the default map");
} else {
  pass("viewer hides relation-only Prisma fields unless searched");
}

// Inspector: table↔table relation labels under Data access (tables + data system).
const tableRelationsFn = fixtureViewerHtml.indexOf("function tableRelationsHtml");
const isTableRelationEdgeFn = fixtureViewerHtml.indexOf("function isTableRelationEdge");
const relationsHeading = fixtureViewerHtml.indexOf("<h3>Relations</h3>");
const relationDetailClass = fixtureViewerHtml.indexOf('class="relation-detail"');
const viaRelationDetail = fixtureViewerHtml.indexOf('via \' + label');
const tableRelationOwned =
  fixtureViewerHtml.includes('node.kind === "table" && isTableRelationEdge(edge)');
const dataAccessRelations =
  fixtureViewerHtml.includes("function isDataAccessSystem") &&
  fixtureViewerHtml.includes('meta.systemKey === "data"');
if (tableRelationsFn < 0 || isTableRelationEdgeFn < 0 || relationsHeading < 0) {
  fail("viewer inspector missing Relations section for table↔table edges");
} else if (relationDetailClass < 0 || viaRelationDetail < 0) {
  fail("viewer inspector should render relation labels as 'via <name>' detail text");
} else if (!tableRelationOwned) {
  fail(
    "viewer inspector should own table↔table depends-on edges in Relations (not Imports & calls)",
  );
} else if (!dataAccessRelations) {
  fail("viewer inspector should aggregate Relations on Data access system nodes");
} else if (!tableRelation?.label || !["payments", "order", "references"].includes(tableRelation.label)) {
  fail(
    `expected fixture Payment↔Order relation label payments/order, got ${JSON.stringify(tableRelation?.label)}`,
  );
} else {
  pass(
    `viewer inspector surfaces table↔table relation labels (via ${tableRelation.label}) beside Data access nodes`,
  );
}

// Canvas: labeled narrative badges for publishes / consumes / migrates on overview.
const narrativeKindsDecl = fixtureViewerHtml.indexOf(
  'const narrativeKinds = new Set(["publishes", "consumes", "migrates"])',
);
const narrativeBadgeFn = fixtureViewerHtml.indexOf("function narrativeBadgeLabel");
const narrativeCss = fixtureViewerHtml.indexOf(".edge.narrative");
const narrativePublishesCss = fixtureViewerHtml.indexOf(".edge.narrative.publishes");
const narrativeMigratesCss = fixtureViewerHtml.indexOf(".edge.narrative.migrates");
// Badges are created via setAttribute in the viewer script (not static HTML).
const edgeBadgeClass = fixtureViewerHtml.indexOf(
  'setAttribute("class", "edge-badge")',
);
const narrativeLegend = fixtureViewerHtml.indexOf('class="narrative">publishes / migrates');
const suppressContainsNearNarrative = fixtureViewerHtml.includes(
  'edge.kind === "contains" &&',
) && fixtureViewerHtml.includes("narrativePairs.has");
const dataNarrativeAttr = fixtureViewerHtml.indexOf('data-narrative", "true"');
const narrativeAppendBadge = fixtureViewerHtml.includes(
  "appendEdgeBadge(geom.mx, geom.my, narrativeBadgeLabel(edges))",
);
if (
  narrativeKindsDecl < 0 ||
  narrativeBadgeFn < 0 ||
  narrativeCss < 0 ||
  narrativePublishesCss < 0 ||
  narrativeMigratesCss < 0 ||
  edgeBadgeClass < 0 ||
  narrativeLegend < 0 ||
  dataNarrativeAttr < 0 ||
  !narrativeAppendBadge
) {
  fail(
    "viewer canvas should label publishes/consumes/migrates with narrative edge badges",
  );
} else if (!suppressContainsNearNarrative) {
  fail(
    "viewer should suppress contains edges that restated a labeled publish/consume/migrate pair",
  );
} else {
  pass(
    "viewer canvas labels publish/consume/migrates edges so mini-stack messaging + migrations read clearly",
  );
}

// Canvas: table↔table relations are always-on (green data story); collab stays
// selection-only; flows-to stays unlabeled (Product flow band).
const selectionBadgeFn = viewerHtml.indexOf("function selectionEdgeBadgeLabel");
const selectionBadgeSkipFlowsTo =
  viewerHtml.includes('if (edge.kind === "flows-to") return null') &&
  selectionBadgeFn >= 0;
const selectionBadgeUsesCollab =
  viewerHtml.includes("collaborationKinds.has(edge.kind)") &&
  viewerHtml.includes("selectionEdgeBadgeLabel(edge)");
const selectionBadgeSkipsTableRelation =
  selectionBadgeFn >= 0 &&
  viewerHtml.includes("if (isTableRelationEdge(edge)) return null");
const selectionLabelAttr = viewerHtml.indexOf('data-selection-label", "true"');
const selectionBadgeOnlyWhenSelected =
  viewerHtml.includes("if (selected) {") &&
  viewerHtml.includes("const badge = selectionEdgeBadgeLabel(edge)");
const relationEdgeCss = viewerHtml.indexOf(".edge.relation");
const relationGroups =
  viewerHtml.includes("const relationGroups = new Map()") &&
  viewerHtml.includes('data-relation", "true"');
const relationAlwaysOnBadge =
  viewerHtml.includes('appendEdgeBadge(geom.mx, geom.my, labels.join(" · "), false, "relation")') ||
  viewerHtml.includes("appendEdgeBadge(geom.mx, geom.my, labels.join(\" · \"), false, \"relation\")");
const relationLegend = viewerHtml.includes("table relations");
const tableConstellation =
  viewerHtml.includes('node.kind === "table"') &&
  viewerHtml.includes("colGap") &&
  viewerHtml.includes("tables.forEach");
if (
  selectionBadgeFn < 0 ||
  !selectionBadgeSkipFlowsTo ||
  !selectionBadgeUsesCollab ||
  !selectionBadgeSkipsTableRelation ||
  selectionLabelAttr < 0 ||
  !selectionBadgeOnlyWhenSelected
) {
  fail(
    "viewer canvas should label collaboration edges on selection (skip flows-to + table relations)",
  );
} else {
  pass(
    "viewer canvas shows collaboration edge labels on selection so founders read meaning without the inspector",
  );
}
if (
  relationEdgeCss < 0 ||
  !relationGroups ||
  !relationAlwaysOnBadge ||
  !relationLegend ||
  !tableConstellation
) {
  fail(
    "viewer canvas should always-on label table↔table relations (.edge.relation) with a 2-column table constellation",
  );
} else {
  pass(
    "viewer canvas always labels table relations (favorites/follows) and lays tables in a constellation",
  );
}

// Inspector: messaging hubs surface publisher/consumer lists (not raw metadata pills).
const messagingRolesFn = fixtureViewerHtml.indexOf("function messagingRolesHtml");
const messagingHeading = fixtureViewerHtml.indexOf("<h3>Messaging</h3>");
const publishersRoleLabel = fixtureViewerHtml.indexOf('"Publishers"');
const consumersRoleLabel = fixtureViewerHtml.indexOf('"Consumers"');
const messagingHubNote = fixtureViewerHtml.indexOf("Messaging hub");
const messagingOwnedPubSub =
  fixtureViewerHtml.includes('edge.kind === "publishes" || edge.kind === "consumes"') &&
  fixtureViewerHtml.includes('structuredMetaKeys = new Set([') &&
  fixtureViewerHtml.includes('"publishers"') &&
  fixtureViewerHtml.includes('"consumers"') &&
  fixtureViewerHtml.includes('"messagingHub"');
const messagingInInspector =
  fixtureViewerHtml.includes("const messaging = messagingRolesHtml(node)") &&
  fixtureViewerHtml.includes("tableSources + tableRelations + messaging");
if (messagingRolesFn < 0 || messagingHeading < 0) {
  fail("viewer inspector missing Messaging section for queue hubs");
} else if (publishersRoleLabel < 0 || consumersRoleLabel < 0 || messagingHubNote < 0) {
  fail("viewer inspector should list Publishers and Consumers on messaging hubs");
} else if (!messagingOwnedPubSub || !messagingInInspector) {
  fail(
    "viewer inspector should own publishers/consumers under Messaging (not raw metadata / Imports & calls)",
  );
} else {
  pass("viewer inspector surfaces queue publisher/consumer lists on messaging hubs");
}

// Inspector hygiene: hide compiler-internal metadata pills (projection/systemKey/flowOrder).
const hideCompilerMetaPills =
  fixtureViewerHtml.includes('structuredMetaKeys = new Set([') &&
  fixtureViewerHtml.includes('"projection"') &&
  fixtureViewerHtml.includes('"systemKey"') &&
  fixtureViewerHtml.includes('"flowOrder"');
if (!hideCompilerMetaPills) {
  fail(
    "viewer inspector should hide projection/systemKey/flowOrder pills (compiler internals, not product evidence)",
  );
} else {
  pass("viewer inspector hides projection/systemKey/flowOrder metadata pills");
}

// ---------------------------------------------------------------------------
// Capability ladder rung 2: Next.js App Router fixture (verification/mini-next).
// Smoke + golden floors: pages/layouts, route handlers, client/server split,
// server actions, UI→API flow — excluded from default product scan.
// ---------------------------------------------------------------------------
const miniNextGraph = await compileRepository(miniNextRoot);
const miniNextCounts = countByKind(miniNextGraph.nodes);
console.log(
  `Mini-next graph: ${miniNextGraph.nodes.length} nodes, ${miniNextGraph.edges.length} edges`,
);

requireKind(miniNextCounts, "page", 2);
requireKind(miniNextCounts, "route", 3);
requireKind(miniNextCounts, "component", 2);

const miniNextRouteLabels = new Set(
  miniNextGraph.nodes
    .filter((node) => node.kind === "route")
    .map((node) => node.label),
);
for (const expected of ["GET Posts", "POST Posts", "GET Health"]) {
  if (!miniNextRouteLabels.has(expected)) {
    fail(
      `mini-next missing humanized route ${expected}; found ${[...miniNextRouteLabels].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-next has route ${expected}`);
  }
}

const miniNextPages = miniNextGraph.nodes.filter((node) => node.kind === "page");
const miniNextPageLabels = new Set(miniNextPages.map((node) => node.label));
if (!miniNextPageLabels.has("Home") || !miniNextPageLabels.has("Dashboard")) {
  fail(
    `mini-next expected humanized Home + Dashboard pages, found ${[...miniNextPageLabels].join(", ") || "(none)"}`,
  );
} else {
  pass("mini-next App Router pages: Home, Dashboard");
}

const miniNextClientComponents = miniNextGraph.nodes.filter(
  (node) =>
    node.kind === "component" &&
    (node.metadata?.clientComponent === true || node.metadata?.runtime === "client"),
);
const miniNextClientLabels = new Set(
  miniNextClientComponents.map((node) => node.label),
);
if (
  miniNextClientComponents.length < 2 ||
  !miniNextClientLabels.has("Post list") ||
  !miniNextClientLabels.has("Post form")
) {
  fail(
    `mini-next expected humanized client components Post list + Post form, found ${[...miniNextClientLabels].join(", ") || "(none)"}`,
  );
} else {
  pass("mini-next client components: Post form, Post list");
}

const miniNextServerActions = miniNextGraph.nodes.filter(
  (node) => node.metadata?.serverAction === true,
);
const miniNextServerActionLabels = new Set(
  miniNextServerActions.map((node) => node.label),
);
if (
  !miniNextServerActionLabels.has("Create post") ||
  !miniNextServerActionLabels.has("Delete post")
) {
  fail(
    `mini-next missing humanized server actions Create post/Delete post; found ${[...miniNextServerActionLabels].join(", ") || "(none)"}`,
  );
} else {
  pass("mini-next server actions: Create post, Delete post");
}

const miniNextLayout = miniNextGraph.nodes.find(
  (node) =>
    node.metadata?.next === "layout" &&
    node.kind === "component" &&
    typeof node.metadata?.path === "string",
);
if (!miniNextLayout || miniNextLayout.label !== "App layout") {
  fail(
    `mini-next expected App layout label, found '${miniNextLayout?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-next layout humanized: App layout");
}

const miniNextSystems = miniNextGraph.nodes.filter(
  (node) => node.metadata?.projection === "semantic",
);
const miniNextByKey = new Map(
  miniNextSystems
    .filter((node) => typeof node.metadata?.systemKey === "string")
    .map((node) => [node.metadata.systemKey, node]),
);
if (miniNextByKey.get("ui")?.label !== "Journal UI") {
  fail(
    `mini-next UI label expected 'Journal UI' from README, found '${miniNextByKey.get("ui")?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-next UI labeled Journal UI");
}
if (miniNextByKey.get("api")?.label !== "Posts API") {
  fail(
    `mini-next API label expected 'Posts API' from README, found '${miniNextByKey.get("api")?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-next API labeled Posts API");
}

const miniNextFlow = miniNextSystems
  .filter((node) => typeof node.metadata?.flowOrder === "number")
  .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
const miniNextFlowKeys = miniNextFlow.map((node) => node.metadata.systemKey);
if (
  miniNextFlowKeys.indexOf("ui") < 0 ||
  miniNextFlowKeys.indexOf("api") < 0 ||
  miniNextFlowKeys.indexOf("ui") > miniNextFlowKeys.indexOf("api")
) {
  fail(
    `mini-next flowOrder expected UI → API, got ${miniNextFlow.map((node) => node.label).join(" → ") || "(none)"}`,
  );
} else {
  pass(
    `mini-next flowOrder: ${miniNextFlow.map((node) => node.label).join(" → ")}`,
  );
}

const miniNextUi = miniNextByKey.get("ui");
const miniNextApi = miniNextByKey.get("api");
const miniNextUiUsesApi = miniNextGraph.edges.some(
  (edge) =>
    edge.kind === "uses" &&
    edge.source === miniNextUi?.id &&
    edge.target === miniNextApi?.id,
);
if (!miniNextUiUsesApi) {
  fail("mini-next missing Journal UI -[uses]-> Posts API collaboration");
} else {
  pass("mini-next collaboration: Journal UI -[uses]-> Posts API");
}

const miniNextCommerceNoise = miniNextGraph.edges.some((edge) =>
  (edge.evidence || []).some(
    (item) =>
      typeof item.detail === "string" &&
      (item.detail.includes("Checkout") || item.detail.includes("orders")),
  ),
);
if (miniNextCommerceNoise) {
  fail("mini-next should not inherit Checkout/orders commerce collaboration copy");
} else {
  pass("mini-next has no Checkout/orders commerce collaboration noise");
}

const miniNextRoutesUnderApi = miniNextGraph.nodes.filter(
  (node) =>
    node.kind === "route" &&
    node.parentId === miniNextApi?.id,
);
if (miniNextRoutesUnderApi.length < 3) {
  fail(
    `mini-next expected >=3 routes nested under Posts API, found ${miniNextRoutesUnderApi.length}`,
  );
} else {
  pass(`mini-next ${miniNextRoutesUnderApi.length} routes nested under Posts API`);
}

const miniNextPagesUnderUi = miniNextPages.filter(
  (node) => node.parentId === miniNextUi?.id,
);
if (miniNextPagesUnderUi.length < 2) {
  fail(
    `mini-next expected pages nested under Journal UI, found ${miniNextPagesUnderUi.length}`,
  );
} else {
  pass(`mini-next ${miniNextPagesUnderUi.length} pages nested under Journal UI`);
}

const miniNextCollapsedRoutes = miniNextRoutesUnderApi.filter(
  (node) => node.metadata?.collapsedInOverview === true,
);
const miniNextCollapsedPages = miniNextPagesUnderUi.filter(
  (node) => node.metadata?.collapsedInOverview === true,
);
if (miniNextCollapsedRoutes.length < 3 || miniNextCollapsedPages.length < 2) {
  fail(
    `mini-next overview should collapse routes/pages under systems (routes=${miniNextCollapsedRoutes.length}, pages=${miniNextCollapsedPages.length})`,
  );
} else {
  pass("mini-next overview collapses App Router pages + route handlers under systems");
}

const miniNextActionsUnderApi = miniNextServerActions.filter(
  (node) => node.parentId === miniNextApi?.id,
);
if (miniNextActionsUnderApi.length < 2) {
  fail(
    `mini-next expected server actions nested under Posts API, found ${miniNextActionsUnderApi.length}`,
  );
} else {
  pass("mini-next server actions nested under Posts API");
}

const miniNextClientsUnderUi = miniNextClientComponents.filter(
  (node) => node.parentId === miniNextUi?.id,
);
if (miniNextClientsUnderUi.length < 2) {
  fail(
    `mini-next expected client components nested under Journal UI, found ${miniNextClientsUnderUi.length}`,
  );
} else {
  pass("mini-next client components nested under Journal UI");
}

const miniNextHome = miniNextPages.find((node) => node.label === "Home");
const miniNextHomeChild = miniNextGraph.nodes.find(
  (node) =>
    node.parentId === miniNextHome?.id &&
    node.kind === "component" &&
    /home page/i.test(node.label),
);
if (!miniNextHomeChild) {
  fail(
    `mini-next expected Home page implementation nested under Home page node, found children: ${miniNextGraph.nodes
      .filter((node) => node.parentId === miniNextHome?.id)
      .map((node) => node.label)
      .join(", ") || "(none)"}`,
  );
} else {
  pass("mini-next Home page keeps Home page child nested (not flattened onto UI)");
}

// ---------------------------------------------------------------------------
// Capability ladder rung 1: real Node/Express repo (pinned SHA, gitignored).
// Golden-lock a legible product map: API + Data systems, routes/tables nested,
// flowOrder left-to-right, join tables collapsed, clean product title.
// ---------------------------------------------------------------------------
let realRepoRoot;
try {
  realRepoRoot = await ensureRealRepo(REALWORLD_EXPRESS);
  pass(
    `real repo ${REALWORLD_EXPRESS.name} ready @ ${REALWORLD_EXPRESS.sha.slice(0, 12)}`,
  );
} catch (error) {
  fail(
    `could not ensure real repo ${REALWORLD_EXPRESS.name}@${REALWORLD_EXPRESS.sha}: ${error instanceof Error ? error.message : error}`,
  );
}

if (realRepoRoot) {
  let realGraph;
  try {
    realGraph = await compileRepository(realRepoRoot);
    pass(
      `real-repo scan completed: ${realGraph.nodes.length} nodes, ${realGraph.edges.length} edges`,
    );
  } catch (error) {
    fail(
      `real-repo scan crashed on ${REALWORLD_EXPRESS.name}: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (realGraph) {
    const realCounts = countByKind(realGraph.nodes);
    const realRoutes = realGraph.nodes.filter((node) => node.kind === "route");
    const realTables = realGraph.nodes.filter((node) => node.kind === "table");
    const realJoinTables = realTables.filter(
      (node) => node.metadata?.joinTable === true,
    );
    const realProductTables = realTables.filter(
      (node) => node.metadata?.joinTable !== true,
    );
    const realSemantic = realGraph.nodes.filter(
      (node) => node.metadata?.projection === "semantic",
    );
    const realProduct = realGraph.nodes.find((node) => node.kind === "product");
    const realSummary = {
      pin: `${REALWORLD_EXPRESS.name}@${REALWORLD_EXPRESS.sha}`,
      product: realProduct?.label ?? "(missing)",
      nodes: realGraph.nodes.length,
      edges: realGraph.edges.length,
      routes: realRoutes.length,
      tables: realTables.length,
      productTables: realProductTables.map((node) => node.label),
      joinTables: realJoinTables.map((node) => node.label),
      semantic: realSemantic.map((node) => node.label),
      kinds: Object.fromEntries(
        [...realCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      ),
    };
    console.log(`Real-repo scan summary: ${JSON.stringify(realSummary)}`);

    // Smoke floors only — prove the compiler maps a foreign Express+Prisma app.
    if (realGraph.nodes.length < 20) {
      fail(
        `real-repo node floor: ${realGraph.nodes.length} < 20 (map looks empty)`,
      );
    } else {
      pass(`real-repo nodes: ${realGraph.nodes.length}`);
    }
    if (realRoutes.length < 5) {
      fail(
        `real-repo route floor: ${realRoutes.length} < 5 (Express routes missing)`,
      );
    } else {
      pass(`real-repo routes: ${realRoutes.length}`);
    }
    if (realProductTables.length < 3) {
      fail(
        `real-repo product table floor: ${realProductTables.length} < 3 (Prisma models missing)`,
      );
    } else {
      pass(`real-repo product tables: ${realProductTables.length}`);
    }
    const expectedRouteSnippets = [
      "POST /users/login",
      "GET /articles",
      "GET /tags",
    ];
    const realRouteLabels = new Set(realRoutes.map((node) => node.label));
    const missingRoutes = expectedRouteSnippets.filter(
      (label) => !realRouteLabels.has(label),
    );
    if (missingRoutes.length) {
      fail(
        `real-repo missing expected Express routes: ${missingRoutes.join(", ")}`,
      );
    } else {
      pass(
        `real-repo has core RealWorld routes (${expectedRouteSnippets.join(", ")})`,
      );
    }
    if (realSemantic.length < 1) {
      fail("real-repo produced no semantic projection nodes");
    } else {
      pass(`real-repo semantic nodes: ${realSemantic.length}`);
    }

    // Projection fixes: no markdown-image labels; join tables collapsed.
    const markdownImageLabels = realGraph.nodes
      .filter((node) => /!\[/.test(node.label))
      .map((node) => `${node.kind}:${node.label}`);
    if (markdownImageLabels.length) {
      fail(
        `real-repo labels still contain markdown images: ${markdownImageLabels.join("; ")}`,
      );
    } else {
      pass("real-repo labels have no markdown-image chrome");
    }
    if (realProduct?.label !== "Node/Express/Prisma Example App") {
      fail(
        `real-repo product label expected cleaned README title, found '${realProduct?.label ?? "(missing)"}'`,
      );
    } else {
      pass(
        `real-repo product label from README: ${realProduct.label}`,
      );
    }
    const pollutedSystems = realSemantic.filter(
      (node) =>
        /!\[|project-logo\.png/i.test(node.label) ||
        /^generate\b/i.test(node.label),
    );
    if (pollutedSystems.length) {
      fail(
        `real-repo semantic labels still polluted: ${pollutedSystems.map((n) => n.label).join("; ")}`,
      );
    } else {
      pass("real-repo semantic system labels are clean");
    }
    const apiSystem = realSemantic.find(
      (node) => node.metadata?.systemKey === "api",
    );
    const dataSystem = realSemantic.find(
      (node) => node.metadata?.systemKey === "data",
    );
    if (!apiSystem) {
      fail("real-repo missing HTTP API semantic system");
    } else if (apiSystem.label !== "HTTP API") {
      fail(
        `real-repo api system label expected 'HTTP API', found '${apiSystem.label}'`,
      );
    } else {
      pass("real-repo api system labeled 'HTTP API'");
    }
    if (!dataSystem) {
      fail("real-repo missing Data access semantic system");
    } else if (dataSystem.label !== "Data access") {
      fail(
        `real-repo data system label expected 'Data access', found '${dataSystem.label}'`,
      );
    } else {
      pass("real-repo data system keeps path-role label 'Data access'");
    }

    // Nesting: every route under API; product tables under Data; overview collapses routes.
    if (apiSystem) {
      const orphanRoutes = realRoutes.filter(
        (node) => node.parentId !== apiSystem.id,
      );
      if (orphanRoutes.length) {
        fail(
          `real-repo routes not nested under HTTP API: ${orphanRoutes
            .map((node) => node.label)
            .join(", ")}`,
        );
      } else if (realRoutes.length < 20) {
        fail(
          `real-repo expected ≥20 routes nested under HTTP API, found ${realRoutes.length}`,
        );
      } else {
        pass(
          `real-repo ${realRoutes.length} routes nested under HTTP API`,
        );
      }
      const uncollapsedRoutes = realRoutes.filter(
        (node) => node.metadata?.collapsedInOverview !== true,
      );
      if (uncollapsedRoutes.length) {
        fail(
          `real-repo routes should collapse on overview under HTTP API: ${uncollapsedRoutes
            .map((node) => node.label)
            .join(", ")}`,
        );
      } else {
        pass("real-repo routes collapsed on overview (API tells the story)");
      }
    }
    if (dataSystem) {
      const orphanTables = realProductTables.filter(
        (node) => node.parentId !== dataSystem.id,
      );
      if (orphanTables.length) {
        fail(
          `real-repo product tables not nested under Data access: ${orphanTables
            .map((node) => node.label)
            .join(", ")}`,
        );
      } else {
        pass(
          `real-repo ${realProductTables.length} product tables nested under Data access`,
        );
      }
      const collapsedProductTables = realProductTables.filter(
        (node) => node.metadata?.collapsedInOverview === true,
      );
      if (collapsedProductTables.length) {
        fail(
          `real-repo product tables should stay visible under Data access: ${collapsedProductTables
            .map((node) => node.label)
            .join(", ")}`,
        );
      } else {
        pass("real-repo product tables visible under Data access on overview");
      }
    }

    // flowOrder + flows-to: API → Data left-to-right without Details.
    const realFlowOrdered = realSemantic
      .filter((node) => typeof node.metadata?.flowOrder === "number")
      .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
    const realFlowLabels = realFlowOrdered.map((node) => node.label);
    const expectedRealFlow = ["HTTP API", "Data access"];
    if (realFlowLabels.join(" → ") !== expectedRealFlow.join(" → ")) {
      fail(
        `real-repo flowOrder expected ${expectedRealFlow.join(" → ")}, got ${realFlowLabels.join(" → ") || "(none)"}`,
      );
    } else {
      pass(`real-repo flowOrder: ${realFlowLabels.join(" → ")}`);
    }
    if (apiSystem && dataSystem) {
      const apiFlowsToData = realGraph.edges.some(
        (edge) =>
          edge.kind === "flows-to" &&
          edge.source === apiSystem.id &&
          edge.target === dataSystem.id,
      );
      if (!apiFlowsToData) {
        fail("real-repo missing flows-to edge HTTP API → Data access");
      } else {
        pass("real-repo flows-to: HTTP API → Data access");
      }
    }

    const expectedJoinNoise = [
      "_articletotag",
      "_userfavorite",
      "_userfollow",
      "Articletag",
    ];
    const joinLabels = new Set(
      realJoinTables.map((node) => node.label.toLowerCase()),
    );
    // Accept either preferred label casing; match case-insensitively.
    const missingJoinCollapse = expectedJoinNoise.filter(
      (label) =>
        !realJoinTables.some(
          (node) => node.label.toLowerCase() === label.toLowerCase(),
        ) &&
        realTables.some(
          (node) => node.label.toLowerCase() === label.toLowerCase(),
        ),
    );
    if (missingJoinCollapse.length) {
      fail(
        `real-repo join tables not marked joinTable: ${missingJoinCollapse.join(", ")}`,
      );
    } else if (realJoinTables.length < 3) {
      fail(
        `real-repo expected ≥3 collapsed join tables, found ${realJoinTables.length} (${[...joinLabels].join(", ")})`,
      );
    } else {
      pass(
        `real-repo join tables collapsed: ${realJoinTables.map((n) => n.label).join(", ")}`,
      );
    }
    const expectedModels = ["Article", "Comment", "Tag", "User"];
    const missingModels = expectedModels.filter(
      (label) => !realProductTables.some((node) => node.label === label),
    );
    if (missingModels.length) {
      fail(
        `real-repo missing core Prisma models on default map: ${missingModels.join(", ")}`,
      );
    } else {
      pass(
        `real-repo core Prisma models visible: ${expectedModels.join(", ")}`,
      );
    }

    // Data story: favorites + follows must surface without opening join tables.
    const tableById = new Map(realTables.map((node) => [node.id, node]));
    const productTableRelations = realGraph.edges.filter(
      (edge) =>
        edge.kind === "depends-on" &&
        tableById.has(edge.source) &&
        tableById.has(edge.target) &&
        !tableById.get(edge.source)?.metadata?.joinTable &&
        !tableById.get(edge.target)?.metadata?.joinTable,
    );
    const relationSummary = (sourceLabel, targetLabel) =>
      productTableRelations
        .filter(
          (edge) =>
            tableById.get(edge.source)?.label === sourceLabel &&
            tableById.get(edge.target)?.label === targetLabel,
        )
        .map((edge) => String(edge.label ?? ""));
    const userArticleLabels = relationSummary("User", "Article");
    const articleUserLabels = relationSummary("Article", "User");
    const userFollowLabels = relationSummary("User", "User");
    const favoritesOnUserArticle = userArticleLabels.some((label) =>
      /\bfavorites\b/i.test(label),
    );
    const authoredOnUserArticle = userArticleLabels.some((label) =>
      /\bauthored\b/i.test(label),
    );
    const favoritedByOnArticleUser = articleUserLabels.some((label) =>
      /\bfavorited by\b/i.test(label),
    );
    const authorOnArticleUser = articleUserLabels.some((label) =>
      /\bauthor\b/i.test(label),
    );
    const followsOnUser = userFollowLabels.some(
      (label) =>
        /\bfollows\b/i.test(label) ||
        (/\bfollowing\b/i.test(label) && /\bfollowedBy\b/i.test(label)),
    );
    const tagListHumanized = productTableRelations.some(
      (edge) =>
        tableById.get(edge.source)?.label === "Article" &&
        tableById.get(edge.target)?.label === "Tag" &&
        /\btags\b/i.test(String(edge.label ?? "")),
    );
    if (!favoritesOnUserArticle || !authoredOnUserArticle) {
      fail(
        `real-repo missing humanized User→Article authored/favorites, got ${JSON.stringify(userArticleLabels)}`,
      );
    } else {
      pass(
        `real-repo User→Article data story: ${userArticleLabels.join(", ")}`,
      );
    }
    if (!favoritedByOnArticleUser || !authorOnArticleUser) {
      fail(
        `real-repo missing humanized Article→User author/favorited by, got ${JSON.stringify(articleUserLabels)}`,
      );
    } else {
      pass(
        `real-repo Article→User data story: ${articleUserLabels.join(", ")}`,
      );
    }
    if (!followsOnUser) {
      fail(
        `real-repo missing clean User→User follows relation, got ${JSON.stringify(userFollowLabels)}`,
      );
    } else {
      pass(`real-repo User→User follows: ${userFollowLabels.join(", ")}`);
    }
    if (!tagListHumanized) {
      fail("real-repo Article→Tag should humanize tagList → tags");
    } else {
      pass("real-repo Article→Tag humanized to tags");
    }
    // Bare API+Data maps must not inherit mini-stack Checkout/orders collab copy.
    const commerceNoise = realGraph.edges.filter(
      (edge) =>
        (edge.kind === "reads" || edge.kind === "uses" || edge.kind === "triggers") &&
        /checkout|orders|fulfill|payments/i.test(
          `${edge.label ?? ""} ${edge.evidence?.map((item) => item.detail).join(" ") ?? ""}`,
        ),
    );
    if (commerceNoise.length) {
      fail(
        `real-repo leaked commerce collaboration copy: ${commerceNoise
          .map((edge) => `${edge.kind}:${edge.label}`)
          .join(", ")}`,
      );
    } else {
      pass("real-repo has no Checkout/orders commerce collaboration noise");
    }
    const joinRelationNoise = realGraph.edges.filter(
      (edge) =>
        edge.kind === "depends-on" &&
        ((tableById.get(edge.source)?.metadata?.joinTable ?? false) ||
          (tableById.get(edge.target)?.metadata?.joinTable ?? false)),
    );
    if (joinRelationNoise.length) {
      fail(
        `real-repo join tables still expose depends-on edges: ${joinRelationNoise
          .map((edge) => {
            const source = tableById.get(edge.source)?.label ?? edge.source;
            const target = tableById.get(edge.target)?.label ?? edge.target;
            return `${source}→${target}`;
          })
          .join(", ")}`,
      );
    } else {
      pass("real-repo join tables carry no depends-on edges (favorites/follows on models)");
    }
  }
}

// ---------------------------------------------------------------------------
// Capability ladder rung 2: real Next.js App Router repo (pinned SHA, gitignored).
// Golden-lock a legible SaaS map: UI + HTTP API, pages/routes nested + collapsed,
// UI→API flow/uses, server actions + client components, clean product title.
// ---------------------------------------------------------------------------
let nextRealRoot;
try {
  nextRealRoot = await ensureRealRepo(NEXTJS_SAAS_STARTER);
  pass(
    `next real repo ${NEXTJS_SAAS_STARTER.name} ready @ ${NEXTJS_SAAS_STARTER.sha.slice(0, 12)}`,
  );
} catch (error) {
  fail(
    `could not ensure next real repo ${NEXTJS_SAAS_STARTER.name}@${NEXTJS_SAAS_STARTER.sha}: ${error instanceof Error ? error.message : error}`,
  );
}

if (nextRealRoot) {
  let nextRealGraph;
  try {
    nextRealGraph = await compileRepository(nextRealRoot);
    pass(
      `next-real-repo scan completed: ${nextRealGraph.nodes.length} nodes, ${nextRealGraph.edges.length} edges`,
    );
  } catch (error) {
    fail(
      `next-real-repo scan crashed on ${NEXTJS_SAAS_STARTER.name}: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (nextRealGraph) {
    const nextPages = nextRealGraph.nodes.filter((node) => node.kind === "page");
    const nextRoutes = nextRealGraph.nodes.filter((node) => node.kind === "route");
    const nextTables = nextRealGraph.nodes.filter((node) => node.kind === "table");
    const nextSemantic = nextRealGraph.nodes.filter(
      (node) => node.metadata?.projection === "semantic",
    );
    const nextProduct = nextRealGraph.nodes.find((node) => node.kind === "product");
    const nextUi = nextSemantic.find((node) => node.metadata?.systemKey === "ui");
    const nextApi = nextSemantic.find((node) => node.metadata?.systemKey === "api");
    const nextServerActions = nextRealGraph.nodes.filter(
      (node) => node.metadata?.serverAction === true,
    );
    const nextClientComponents = nextRealGraph.nodes.filter(
      (node) =>
        node.kind === "component" &&
        (node.metadata?.runtime === "client" || node.metadata?.useClient === true),
    );
    const nextSummary = {
      pin: `${NEXTJS_SAAS_STARTER.name}@${NEXTJS_SAAS_STARTER.sha}`,
      product: nextProduct?.label ?? "(missing)",
      nodes: nextRealGraph.nodes.length,
      edges: nextRealGraph.edges.length,
      pages: nextPages.map((node) => node.label),
      routes: nextRoutes.map((node) => node.label),
      tables: nextTables.map((node) => node.label),
      serverActions: nextServerActions.map((node) => node.label),
      clientComponents: nextClientComponents.length,
      semantic: nextSemantic.map((node) => node.label),
    };
    console.log(`Next-real-repo scan summary: ${JSON.stringify(nextSummary)}`);

    if (nextRealGraph.nodes.length < 40) {
      fail(
        `next-real-repo node floor: ${nextRealGraph.nodes.length} < 40 (map looks empty)`,
      );
    } else {
      pass(`next-real-repo nodes: ${nextRealGraph.nodes.length}`);
    }
    if (nextProduct?.label !== "Next.js SaaS Starter") {
      fail(
        `next-real-repo product label expected README title 'Next.js SaaS Starter', found '${nextProduct?.label ?? "(missing)"}'`,
      );
    } else {
      pass(`next-real-repo product label: ${nextProduct.label}`);
    }
    if (!nextUi) {
      fail("next-real-repo missing UI semantic system");
    } else if (nextUi.label !== "UI") {
      fail(
        `next-real-repo UI system label expected 'UI', found '${nextUi.label}'`,
      );
    } else {
      pass("next-real-repo UI system labeled 'UI'");
    }
    if (!nextApi) {
      fail("next-real-repo missing HTTP API semantic system");
    } else if (nextApi.label !== "HTTP API") {
      fail(
        `next-real-repo api system label expected 'HTTP API', found '${nextApi.label}'`,
      );
    } else {
      pass("next-real-repo api system labeled 'HTTP API'");
    }

    const expectedNextPages = [
      "Home",
      "Pricing",
      "Dashboard",
      "Dashboard · Activity",
      "Dashboard · General",
      "Dashboard · Security",
      "Sign in",
      "Sign up",
    ];
    const nextPageLabels = new Set(nextPages.map((node) => node.label));
    const missingNextPages = expectedNextPages.filter(
      (label) => !nextPageLabels.has(label),
    );
    if (missingNextPages.length) {
      fail(
        `next-real-repo missing humanized App Router pages: ${missingNextPages.join(", ")}; found ${[...nextPageLabels].join(", ") || "(none)"}`,
      );
    } else {
      pass(
        `next-real-repo App Router pages: ${expectedNextPages.join(", ")}`,
      );
    }
    if (nextUi) {
      const orphanPages = nextPages.filter((node) => node.parentId !== nextUi.id);
      if (orphanPages.length) {
        fail(
          `next-real-repo pages not nested under UI: ${orphanPages
            .map((node) => node.label)
            .join(", ")}`,
        );
      } else if (nextPages.length < 8) {
        fail(
          `next-real-repo expected ≥8 pages nested under UI, found ${nextPages.length}`,
        );
      } else {
        pass(`next-real-repo ${nextPages.length} pages nested under UI`);
      }
      const uncollapsedPages = nextPages.filter(
        (node) => node.metadata?.collapsedInOverview !== true,
      );
      if (uncollapsedPages.length) {
        fail(
          `next-real-repo pages should collapse on overview under UI: ${uncollapsedPages
            .map((node) => node.label)
            .join(", ")}`,
        );
      } else {
        pass("next-real-repo pages collapsed on overview (UI tells the story)");
      }
    }

    const expectedNextRoutes = [
      "GET User",
      "GET Team",
      "GET Stripe checkout",
      "POST Stripe webhook",
    ];
    const nextRouteLabels = new Set(nextRoutes.map((node) => node.label));
    const missingNextRoutes = expectedNextRoutes.filter(
      (label) => !nextRouteLabels.has(label),
    );
    if (missingNextRoutes.length) {
      fail(
        `next-real-repo missing humanized App Router routes: ${missingNextRoutes.join(", ")}; found ${[...nextRouteLabels].join(", ") || "(none)"}`,
      );
    } else {
      pass(
        `next-real-repo route handlers: ${expectedNextRoutes.join(", ")}`,
      );
    }
    if (nextApi) {
      const orphanRoutes = nextRoutes.filter(
        (node) => node.parentId !== nextApi.id,
      );
      if (orphanRoutes.length) {
        fail(
          `next-real-repo routes not nested under HTTP API: ${orphanRoutes
            .map((node) => node.label)
            .join(", ")}`,
        );
      } else {
        pass(
          `next-real-repo ${nextRoutes.length} routes nested under HTTP API`,
        );
      }
      const uncollapsedRoutes = nextRoutes.filter(
        (node) => node.metadata?.collapsedInOverview !== true,
      );
      if (uncollapsedRoutes.length) {
        fail(
          `next-real-repo routes should collapse on overview under HTTP API: ${uncollapsedRoutes
            .map((node) => node.label)
            .join(", ")}`,
        );
      } else {
        pass(
          "next-real-repo routes collapsed on overview (API tells the story)",
        );
      }
    }

    if (nextUi && nextApi) {
      const uiFlowsToApi = nextRealGraph.edges.some(
        (edge) =>
          edge.kind === "flows-to" &&
          edge.source === nextUi.id &&
          edge.target === nextApi.id,
      );
      const uiUsesApi = nextRealGraph.edges.some(
        (edge) =>
          edge.kind === "uses" &&
          edge.source === nextUi.id &&
          edge.target === nextApi.id,
      );
      if (!uiFlowsToApi) {
        fail("next-real-repo missing flows-to edge UI → HTTP API");
      } else {
        pass("next-real-repo flows-to: UI → HTTP API");
      }
      if (!uiUsesApi) {
        fail("next-real-repo missing uses edge UI → HTTP API");
      } else {
        pass("next-real-repo collaboration: UI -[uses]-> HTTP API");
      }
    }

    const nextActionLabels = new Set(
      nextServerActions.map((node) => node.label),
    );
    // Auth + team + billing mutations from 'use server' files — including
    // HOF-wrapped exports (validatedAction / withTeam), not only bare fns.
    const expectedNextActions = [
      "Sign in",
      "Sign up",
      "Sign out",
      "Update password",
      "Delete account",
      "Update account",
      "Remove team member",
      "Invite team member",
      "Checkout",
      "Customer portal",
    ];
    const missingNextActions = expectedNextActions.filter(
      (label) => !nextActionLabels.has(label),
    );
    if (missingNextActions.length) {
      fail(
        `next-real-repo missing humanized server actions: ${missingNextActions.join(", ")}; found ${[...nextActionLabels].join(", ") || "(none)"}`,
      );
    } else {
      pass(
        `next-real-repo server actions: ${expectedNextActions.join(", ")}`,
      );
    }
    if (nextApi) {
      const orphanActions = nextServerActions.filter(
        (node) => node.parentId !== nextApi.id,
      );
      if (orphanActions.length) {
        fail(
          `next-real-repo server actions not nested under HTTP API: ${orphanActions
            .map((node) => node.label)
            .join(", ")}`,
        );
      } else {
        pass(
          `next-real-repo ${nextServerActions.length} server actions nested under HTTP API`,
        );
      }
    }

    // Auth + billing hubs stay visible on overview beside UI→API→Data.
    const expectedAuthBillingHubs = [
      "Sign in",
      "Sign up",
      "Sign out",
      "Checkout",
      "Customer portal",
    ];
    const nextActionByLabel = new Map(
      nextServerActions.map((node) => [node.label, node]),
    );
    const missingAuthBillingHubs = expectedAuthBillingHubs.filter((label) => {
      const node = nextActionByLabel.get(label);
      return (
        !node ||
        node.parentId !== nextApi?.id ||
        node.metadata?.collapsedInOverview === true ||
        node.metadata?.overviewHub !== true
      );
    });
    if (missingAuthBillingHubs.length) {
      fail(
        `next-real-repo auth/billing overview hubs missing or collapsed: ${missingAuthBillingHubs.join(", ")}`,
      );
    } else {
      pass(
        `next-real-repo auth/billing overview hubs: ${expectedAuthBillingHubs.join(", ")}`,
      );
    }
    const buriedTeamActions = nextServerActions.filter(
      (node) =>
        ["Update password", "Invite team member", "Remove team member"].includes(
          node.label,
        ) && node.metadata?.collapsedInOverview !== true,
    );
    if (buriedTeamActions.length) {
      fail(
        `next-real-repo secondary server actions should stay collapsed on overview: ${buriedTeamActions
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass("next-real-repo secondary server actions collapsed on overview");
    }

    // Page children / skeletons / shadcn leaves must not clutter the default map.
    const nextUncollapsedComponents = nextRealGraph.nodes.filter(
      (node) =>
        node.kind === "component" &&
        node.metadata?.projection !== "semantic" &&
        node.metadata?.collapsedInOverview !== true,
    );
    if (nextUncollapsedComponents.length) {
      fail(
        `next-real-repo UI component chrome should collapse on overview: ${nextUncollapsedComponents
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass("next-real-repo UI component chrome collapsed on overview");
    }

    if (nextClientComponents.length < 5) {
      fail(
        `next-real-repo client component floor: ${nextClientComponents.length} < 5`,
      );
    } else {
      pass(
        `next-real-repo client components: ${nextClientComponents.length}`,
      );
    }
    const nextData = nextSemantic.find(
      (node) => node.metadata?.systemKey === "data",
    );
    if (!nextData) {
      fail("next-real-repo missing Data access semantic system");
    } else if (nextData.label !== "Data access") {
      fail(
        `next-real-repo data system label expected 'Data access', found '${nextData.label}'`,
      );
    } else {
      pass("next-real-repo data system labeled 'Data access'");
    }
    if (
      nextSemantic.some(
        (node) =>
          node.metadata?.systemKey === "schema" ||
          node.label === "Schema contract",
      )
    ) {
      fail(
        "next-real-repo should not project lib/db/schema.ts as Schema contract",
      );
    } else {
      pass("next-real-repo has no Schema contract pollution from Drizzle schema");
    }

    const nextProductTables = nextTables.filter(
      (node) => node.metadata?.joinTable !== true,
    );
    const expectedNextTables = [
      "User",
      "Team",
      "Team member",
      "Activity log",
      "Invitation",
    ];
    const nextTableLabels = new Set(
      nextProductTables.map((node) => node.label),
    );
    const missingNextTables = expectedNextTables.filter(
      (label) => !nextTableLabels.has(label),
    );
    const publicAliasLeak = nextProductTables.filter((node) =>
      /^public\./i.test(node.label),
    );
    if (missingNextTables.length) {
      fail(
        `next-real-repo missing product tables: ${missingNextTables.join(", ")}; found ${[...nextTableLabels].join(", ") || "(none)"}`,
      );
    } else if (publicAliasLeak.length) {
      fail(
        `next-real-repo Public.* table aliases not deduped: ${publicAliasLeak
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else if (nextProductTables.length !== expectedNextTables.length) {
      fail(
        `next-real-repo expected ${expectedNextTables.length} product tables after Public.* dedupe, found ${nextProductTables.length}: ${[...nextTableLabels].join(", ")}`,
      );
    } else {
      pass(
        `next-real-repo product tables: ${expectedNextTables.join(", ")}`,
      );
    }
    if (nextData) {
      const orphanTables = nextProductTables.filter(
        (node) => node.parentId !== nextData.id,
      );
      if (orphanTables.length) {
        fail(
          `next-real-repo tables not nested under Data access: ${orphanTables
            .map((node) => node.label)
            .join(", ")}`,
        );
      } else {
        pass(
          `next-real-repo ${nextProductTables.length} tables nested under Data access`,
        );
      }
      const collapsedProductTables = nextProductTables.filter(
        (node) => node.metadata?.collapsedInOverview === true,
      );
      if (collapsedProductTables.length) {
        fail(
          `next-real-repo product tables should stay visible under Data access: ${collapsedProductTables
            .map((node) => node.label)
            .join(", ")}`,
        );
      } else {
        pass(
          "next-real-repo product tables visible under Data access on overview",
        );
      }
    }

    // Re-check flow with Data access in the SaaS story band.
    const nextFlowWithData = nextSemantic
      .filter((node) => typeof node.metadata?.flowOrder === "number")
      .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder)
      .map((node) => node.label);
    const uiIdx = nextFlowWithData.indexOf("UI");
    const apiIdx = nextFlowWithData.indexOf("HTTP API");
    const dataIdx = nextFlowWithData.indexOf("Data access");
    if (
      uiIdx < 0 ||
      apiIdx < 0 ||
      dataIdx < 0 ||
      !(uiIdx < apiIdx && apiIdx < dataIdx)
    ) {
      fail(
        `next-real-repo flowOrder should be UI → HTTP API → Data access, got ${nextFlowWithData.join(" → ") || "(none)"}`,
      );
    } else {
      pass(`next-real-repo flowOrder: ${nextFlowWithData.join(" → ")}`);
    }
    if (nextApi && nextData) {
      const apiFlowsToData = nextRealGraph.edges.some(
        (edge) =>
          edge.kind === "flows-to" &&
          edge.source === nextApi.id &&
          edge.target === nextData.id,
      );
      const apiUsesData = nextRealGraph.edges.some(
        (edge) =>
          edge.kind === "uses" &&
          edge.source === nextApi.id &&
          edge.target === nextData.id &&
          edge.label === "query",
      );
      if (!apiFlowsToData) {
        fail("next-real-repo missing flows-to edge HTTP API → Data access");
      } else {
        pass("next-real-repo flows-to: HTTP API → Data access");
      }
      if (!apiUsesData) {
        fail("next-real-repo missing uses edge HTTP API → Data access (query)");
      } else {
        pass("next-real-repo collaboration: HTTP API -[uses:query]-> Data access");
      }
    }

    const nextCommerceNoise = nextRealGraph.edges.filter(
      (edge) =>
        (edge.kind === "reads" ||
          edge.kind === "uses" ||
          edge.kind === "triggers") &&
        /checkout|orders|fulfill|payments/i.test(
          `${edge.label ?? ""} ${edge.evidence?.map((item) => item.detail).join(" ") ?? ""}`,
        ),
    );
    if (nextCommerceNoise.length) {
      fail(
        `next-real-repo leaked commerce collaboration copy: ${nextCommerceNoise
          .map((edge) => `${edge.kind}:${edge.label}`)
          .join(", ")}`,
      );
    } else {
      pass("next-real-repo has no Checkout/orders commerce collaboration noise");
    }
  }
}

// ---------------------------------------------------------------------------
// Capability ladder rung 3: Python servers fixture (verification/mini-python).
// Golden floors: FastAPI + Django routes, Notes API projection, nesting,
// overview collapse — excluded from default product scan.
// ---------------------------------------------------------------------------
const miniPythonGraph = await compileRepository(miniPythonRoot);
const miniPythonRoutes = miniPythonGraph.nodes.filter(
  (node) => node.kind === "route",
);
const miniPythonLabels = new Set(miniPythonRoutes.map((node) => node.label));
console.log(
  `Mini-python graph: ${miniPythonGraph.nodes.length} nodes, ${miniPythonGraph.edges.length} edges → routes ${[...miniPythonLabels].sort().join(", ")}`,
);

const miniPythonProduct = miniPythonGraph.nodes.find(
  (node) => node.kind === "product",
);
if (!miniPythonProduct || miniPythonProduct.label !== "Mini Python notes") {
  fail(
    `mini-python product label expected 'Mini Python notes', found '${miniPythonProduct?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-python product labeled Mini Python notes");
}

const requiredMiniPythonRoutes = [
  "GET Health",
  "GET Ping",
  "HEAD Ping",
  "GET Notes",
  "POST Notes",
  "ANY Articles",
  "ANY Health",
];
for (const expected of requiredMiniPythonRoutes) {
  if (!miniPythonLabels.has(expected)) {
    fail(
      `mini-python missing humanized route ${expected}; found ${[...miniPythonLabels].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-python has route ${expected}`);
  }
}

const miniPythonFastapi = miniPythonRoutes.filter(
  (node) => node.technology === "fastapi",
).length;
const miniPythonDjango = miniPythonRoutes.filter(
  (node) => node.technology === "django",
).length;
if (miniPythonFastapi < 6) {
  fail(`mini-python expected >=6 FastAPI routes, found ${miniPythonFastapi}`);
} else {
  pass(`mini-python FastAPI routes: ${miniPythonFastapi}`);
}
if (miniPythonDjango < 3) {
  fail(`mini-python expected >=3 Django routes, found ${miniPythonDjango}`);
} else {
  pass(`mini-python Django routes: ${miniPythonDjango}`);
}

const miniPythonExtractors = miniPythonGraph.extractors.map((item) => item.id);
if (!miniPythonExtractors.includes("python")) {
  fail(
    `mini-python graph.extractors missing python; found ${JSON.stringify(miniPythonExtractors)}`,
  );
} else {
  pass("mini-python registers python extractor");
}

const miniPythonSystems = miniPythonGraph.nodes.filter(
  (node) => node.metadata?.projection === "semantic",
);
const miniPythonByKey = new Map(
  miniPythonSystems
    .filter((node) => typeof node.metadata?.systemKey === "string")
    .map((node) => [node.metadata.systemKey, node]),
);
const miniPythonApi = miniPythonByKey.get("api");
if (!miniPythonApi || miniPythonApi.label !== "Notes API") {
  fail(
    `mini-python API label expected 'Notes API' from README, found '${miniPythonApi?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-python API labeled Notes API");
}

const miniPythonFlow = miniPythonSystems
  .filter((node) => typeof node.metadata?.flowOrder === "number")
  .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
const miniPythonFlowKeys = miniPythonFlow.map((node) => node.metadata.systemKey);
if (!miniPythonFlowKeys.includes("api")) {
  fail(
    `mini-python flowOrder expected Notes API, got ${miniPythonFlow.map((node) => node.label).join(" → ") || "(none)"}`,
  );
} else {
  pass(
    `mini-python flowOrder includes Notes API (${miniPythonFlow.map((node) => node.label).join(" → ")})`,
  );
}

const miniPythonRoutesUnderApi = miniPythonRoutes.filter(
  (node) => node.parentId === miniPythonApi?.id,
);
if (miniPythonRoutesUnderApi.length < 9) {
  fail(
    `mini-python expected >=9 routes nested under Notes API, found ${miniPythonRoutesUnderApi.length}`,
  );
} else {
  pass(
    `mini-python ${miniPythonRoutesUnderApi.length} routes nested under Notes API`,
  );
}

const miniPythonCollapsedRoutes = miniPythonRoutesUnderApi.filter(
  (node) => node.metadata?.collapsedInOverview === true,
);
if (miniPythonCollapsedRoutes.length < 9) {
  fail(
    `mini-python overview should collapse routes under Notes API (collapsed=${miniPythonCollapsedRoutes.length})`,
  );
} else {
  pass("mini-python overview collapses FastAPI + Django routes under Notes API");
}

const miniPythonCommerceNoise = miniPythonGraph.edges.some((edge) =>
  (edge.evidence || []).some(
    (item) =>
      typeof item.detail === "string" &&
      (item.detail.includes("Checkout") || item.detail.includes("orders")),
  ),
);
if (miniPythonCommerceNoise) {
  fail("mini-python should not inherit Checkout/orders commerce collaboration copy");
} else {
  pass("mini-python has no Checkout/orders commerce collaboration noise");
}

// Alembic op.create_table + SQLAlchemy __tablename__ → Data access tables.
const miniPythonData = miniPythonByKey.get("data");
const miniPythonTables = miniPythonGraph.nodes.filter(
  (node) => node.kind === "table",
);
const miniPythonProductTables = miniPythonTables.filter(
  (node) => node.metadata?.joinTable !== true,
);
const miniPythonJoinTables = miniPythonTables.filter(
  (node) => node.metadata?.joinTable === true,
);
const miniPythonTableLabels = new Set(
  miniPythonProductTables.map((node) => node.label),
);
if (!miniPythonData || miniPythonData.label !== "Data access") {
  fail(
    `mini-python data system label expected 'Data access' from db/, found '${miniPythonData?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-python data system labeled Data access");
}
for (const expected of ["Note", "User", "Tag"]) {
  if (!miniPythonTableLabels.has(expected)) {
    fail(
      `mini-python missing Alembic/SQLAlchemy table ${expected}; found ${[...miniPythonTableLabels].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-python has table ${expected}`);
  }
}
if (miniPythonJoinTables.length < 1) {
  fail("mini-python expected notes_to_tags join table collapsed");
} else {
  pass(
    `mini-python join tables collapsed: ${miniPythonJoinTables.map((n) => n.label).join(", ")}`,
  );
}
const miniPythonTablesUnderData = miniPythonProductTables.filter(
  (node) => node.parentId === miniPythonData?.id,
);
if (miniPythonTablesUnderData.length < 3) {
  fail(
    `mini-python expected ≥3 product tables nested under Data access, found ${miniPythonTablesUnderData.length}`,
  );
} else {
  pass(
    `mini-python ${miniPythonTablesUnderData.length} product tables nested under Data access`,
  );
}
if (
  !miniPythonFlowKeys.includes("api") ||
  !miniPythonFlowKeys.includes("data")
) {
  fail(
    `mini-python flowOrder expected Notes API → Data access, got ${miniPythonFlow.map((node) => node.label).join(" → ") || "(none)"}`,
  );
} else {
  pass(
    `mini-python flowOrder: ${miniPythonFlow.map((node) => node.label).join(" → ")}`,
  );
}

// Celery @shared_task + beat_schedule → Scheduled jobs (fixture; RealWorld has none).
const miniPythonJobs = miniPythonByKey.get("jobs");
const miniPythonJobNodes = miniPythonGraph.nodes.filter(
  (node) => node.kind === "job",
);
const miniPythonCronNodes = miniPythonGraph.nodes.filter(
  (node) => node.kind === "cron",
);
const miniPythonJobLabels = new Set(
  miniPythonJobNodes.map((node) => node.label),
);
const miniPythonCronLabels = new Set(
  miniPythonCronNodes.map((node) => node.label),
);
if (!miniPythonJobs || miniPythonJobs.label !== "Scheduled jobs") {
  fail(
    `mini-python jobs system label expected 'Scheduled jobs', found '${miniPythonJobs?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-python jobs system labeled Scheduled jobs");
}
for (const expected of ["Send digest", "Purge stale notes"]) {
  if (!miniPythonJobLabels.has(expected)) {
    fail(
      `mini-python missing Celery job ${expected}; found ${[...miniPythonJobLabels].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-python has Celery job ${expected}`);
  }
}
if (miniPythonJobNodes.some((node) => node.technology !== "celery")) {
  fail("mini-python Celery jobs should use technology=celery");
} else {
  pass("mini-python Celery jobs technology=celery");
}
const miniPythonJobsUnderSystem = miniPythonJobNodes.filter(
  (node) => node.parentId === miniPythonJobs?.id,
);
if (miniPythonJobsUnderSystem.length < 2) {
  fail(
    `mini-python expected ≥2 jobs nested under Scheduled jobs, found ${miniPythonJobsUnderSystem.length}`,
  );
} else {
  pass(
    `mini-python ${miniPythonJobsUnderSystem.length} jobs nested under Scheduled jobs`,
  );
}
const miniPythonCollapsedJobs = miniPythonJobsUnderSystem.filter(
  (node) => node.metadata?.collapsedInOverview === true,
);
if (miniPythonCollapsedJobs.length < 2) {
  fail(
    `mini-python overview should collapse Celery jobs under Scheduled jobs (collapsed=${miniPythonCollapsedJobs.length})`,
  );
} else {
  pass("mini-python overview collapses Celery jobs under Scheduled jobs");
}
if (miniPythonCronNodes.length < 2) {
  fail(
    `mini-python expected ≥2 Celery beat cron schedules, found ${miniPythonCronNodes.length}: ${[...miniPythonCronLabels].join(", ") || "(none)"}`,
  );
} else {
  pass(`mini-python Celery beat schedules: ${[...miniPythonCronLabels].join(", ")}`);
}
// North-star lock: schedule hubs use plain English, not crontab glyphs.
for (const expected of [
  "Send digest (every hour)",
  "Purge stale notes (every 15 minutes)",
]) {
  if (!miniPythonCronLabels.has(expected)) {
    fail(
      `mini-python missing humanized schedule hub ${expected}; found ${[...miniPythonCronLabels].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-python schedule hub: ${expected}`);
  }
}
if (
  [...miniPythonCronLabels].some((label) =>
    /\b\d+\s+\*\s+\*\s+\*\s+\*/.test(label) || /\*\/\d+/.test(label),
  )
) {
  fail(
    `mini-python cron labels still expose raw cron expressions: ${[...miniPythonCronLabels].join(", ")}`,
  );
} else {
  pass("mini-python cron labels have no raw crontab glyphs");
}
const miniPythonCronHubs = miniPythonCronNodes.filter(
  (node) =>
    node.parentId === miniPythonJobs?.id &&
    node.metadata?.scheduleHub === true &&
    node.metadata?.collapsedInOverview !== true,
);
if (miniPythonCronHubs.length < 2) {
  fail(
    `mini-python expected ≥2 visible Celery schedule hubs under Scheduled jobs, found ${miniPythonCronHubs.length}`,
  );
} else {
  pass(
    `mini-python ${miniPythonCronHubs.length} Celery schedule hubs visible on overview`,
  );
}
if (
  !miniPythonFlowKeys.includes("api") ||
  !miniPythonFlowKeys.includes("jobs") ||
  !miniPythonFlowKeys.includes("data")
) {
  fail(
    `mini-python flowOrder expected Notes API → Scheduled jobs → Data access, got ${miniPythonFlow.map((node) => node.label).join(" → ") || "(none)"}`,
  );
} else {
  pass(
    `mini-python flowOrder with jobs: ${miniPythonFlow.map((node) => node.label).join(" → ")}`,
  );
}
const miniPythonJobsUsesData = miniPythonGraph.edges.some(
  (edge) =>
    edge.kind === "uses" &&
    edge.source === miniPythonJobs?.id &&
    edge.target === miniPythonData?.id &&
    edge.label === "sync",
);
if (!miniPythonJobsUsesData) {
  fail("mini-python expected Scheduled jobs -[uses:sync]-> Data access");
} else {
  pass("mini-python collaboration: Scheduled jobs -[uses:sync]-> Data access");
}
const miniPythonUsesQuery = miniPythonGraph.edges.some(
  (edge) =>
    edge.kind === "uses" &&
    edge.label === "query" &&
    edge.source === miniPythonApi?.id &&
    edge.target === miniPythonData?.id,
);
if (!miniPythonUsesQuery) {
  fail("mini-python expected Notes API -[uses:query]-> Data access");
} else {
  pass("mini-python collaboration: Notes API -[uses:query]-> Data access");
}
const miniPythonScheduleEdges = miniPythonGraph.edges.filter(
  (edge) => edge.kind === "schedules",
);
if (miniPythonScheduleEdges.length < 2) {
  fail(
    `mini-python expected ≥2 cron→job schedules edges, found ${miniPythonScheduleEdges.length}`,
  );
} else {
  pass(
    `mini-python ${miniPythonScheduleEdges.length} Celery schedules edges cron→job`,
  );
}

// Data story parity with FastAPI RealWorld: Note↔Tag tags, Note↔User author/
// authored, quiet module chrome on overview.
const miniPythonTableById = new Map(
  miniPythonTables.map((node) => [node.id, node]),
);
const miniPythonProductRelations = miniPythonGraph.edges.filter(
  (edge) =>
    edge.kind === "depends-on" &&
    miniPythonTableById.has(edge.source) &&
    miniPythonTableById.has(edge.target) &&
    !miniPythonTableById.get(edge.source)?.metadata?.joinTable &&
    !miniPythonTableById.get(edge.target)?.metadata?.joinTable,
);
const miniPythonRelationSummary = (sourceLabel, targetLabel) =>
  miniPythonProductRelations
    .filter(
      (edge) =>
        miniPythonTableById.get(edge.source)?.label === sourceLabel &&
        miniPythonTableById.get(edge.target)?.label === targetLabel,
    )
    .map((edge) => String(edge.label ?? ""));
const miniPythonNoteTag = miniPythonRelationSummary("Note", "Tag");
const miniPythonNoteUser = miniPythonRelationSummary("Note", "User");
const miniPythonUserNote = miniPythonRelationSummary("User", "Note");
if (!miniPythonNoteTag.some((label) => /\btags\b/i.test(label))) {
  fail(
    `mini-python missing Note→Tag tags (lift notes_to_tags), got ${JSON.stringify(miniPythonNoteTag)}`,
  );
} else {
  pass("mini-python Note→Tag humanized to tags");
}
if (!miniPythonNoteUser.some((label) => /\bauthor\b/i.test(label))) {
  fail(
    `mini-python missing Note→User author, got ${JSON.stringify(miniPythonNoteUser)}`,
  );
} else {
  pass("mini-python Note→User relation: author");
}
if (!miniPythonUserNote.some((label) => /\bauthored\b/i.test(label))) {
  fail(
    `mini-python missing User→Note authored reverse, got ${JSON.stringify(miniPythonUserNote)}`,
  );
} else {
  pass("mini-python User→Note relation: authored");
}
const miniPythonVisibleChrome = miniPythonGraph.nodes.filter(
  (node) =>
    node.kind === "module" && node.metadata?.collapsedInOverview !== true,
);
if (miniPythonVisibleChrome.length > 0) {
  fail(
    `mini-python modules should collapse on overview, still visible: ${miniPythonVisibleChrome
      .slice(0, 8)
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-python module chrome collapsed on overview");
}

// ---------------------------------------------------------------------------
// Capability ladder rung 4: MongoDB collections fixture (verification/mini-mongo).
// Golden-lock mongoose.model + Schema collection → Data access collections,
// Notes API routes, Catalog data README label, API→Data flow/uses:query.
// ---------------------------------------------------------------------------
const miniMongoGraph = await compileRepository(miniMongoRoot);
const miniMongoRoutes = miniMongoGraph.nodes.filter(
  (node) => node.kind === "route",
);
const miniMongoRouteLabels = new Set(
  miniMongoRoutes.map((node) => node.label),
);
console.log(
  `Mini-mongo graph: ${miniMongoGraph.nodes.length} nodes, ${miniMongoGraph.edges.length} edges → routes ${[...miniMongoRouteLabels].sort().join(", ")}`,
);

const miniMongoProduct = miniMongoGraph.nodes.find(
  (node) => node.kind === "product",
);
if (!miniMongoProduct || miniMongoProduct.label !== "Mini Mongo notes") {
  fail(
    `mini-mongo product label expected 'Mini Mongo notes', found '${miniMongoProduct?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-mongo product labeled Mini Mongo notes");
}

for (const expected of ["GET /notes", "POST /notes", "GET /health"]) {
  if (!miniMongoRouteLabels.has(expected)) {
    fail(
      `mini-mongo missing route ${expected}; found ${[...miniMongoRouteLabels].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-mongo has route ${expected}`);
  }
}

const miniMongoExtractors = miniMongoGraph.extractors.map((item) => item.id);
if (!miniMongoExtractors.includes("mongo")) {
  fail(
    `mini-mongo graph.extractors missing mongo; found ${JSON.stringify(miniMongoExtractors)}`,
  );
} else {
  pass("mini-mongo registers mongo extractor");
}

const miniMongoSystems = miniMongoGraph.nodes.filter(
  (node) => node.metadata?.projection === "semantic",
);
const miniMongoByKey = new Map(
  miniMongoSystems
    .filter((node) => typeof node.metadata?.systemKey === "string")
    .map((node) => [node.metadata.systemKey, node]),
);
const miniMongoApi = miniMongoByKey.get("api");
if (!miniMongoApi || miniMongoApi.label !== "Notes API") {
  fail(
    `mini-mongo API label expected 'Notes API' from README, found '${miniMongoApi?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-mongo API labeled Notes API");
}

const miniMongoData = miniMongoByKey.get("data");
if (!miniMongoData || miniMongoData.label !== "Catalog data") {
  fail(
    `mini-mongo data system label expected 'Catalog data' from README, found '${miniMongoData?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-mongo data system labeled Catalog data");
}

const miniMongoCollections = miniMongoGraph.nodes.filter(
  (node) => node.kind === "collection",
);
const miniMongoCollectionLabels = new Set(
  miniMongoCollections.map((node) => node.label),
);
for (const expected of [
  "Note",
  "User",
  "Tag",
  // `.collection(CONST)` same-file string bindings → product labels.
  "Search chunks",
  "Query cache",
  // createCollectionForVectorSearch(db, VECTOR_DOCS) — no bare .collection.
  "Vector docs",
]) {
  if (!miniMongoCollectionLabels.has(expected)) {
    fail(
      `mini-mongo missing collection ${expected}; found ${[...miniMongoCollectionLabels].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-mongo has collection ${expected}`);
  }
}

const miniMongoConstCollections = miniMongoCollections.filter((node) =>
  node.evidence?.some((item) =>
    /\.collection\([A-Z_]+ →/.test(item.detail ?? ""),
  ),
);
if (miniMongoConstCollections.length < 2) {
  fail(
    `mini-mongo expected ≥2 .collection(CONST) bindings, found ${miniMongoConstCollections.length}`,
  );
} else {
  pass(
    `mini-mongo ${miniMongoConstCollections.length} collections from .collection(CONST)`,
  );
}

const miniMongoVectorHelperCollections = miniMongoCollections.filter((node) =>
  node.evidence?.some((item) =>
    /createCollectionForVectorSearch\(db,/.test(item.detail ?? ""),
  ),
);
if (miniMongoVectorHelperCollections.length < 1) {
  fail(
    `mini-mongo expected ≥1 createCollectionForVectorSearch collection, found ${miniMongoVectorHelperCollections.length}`,
  );
} else {
  pass(
    `mini-mongo ${miniMongoVectorHelperCollections.length} collections from createCollectionForVectorSearch`,
  );
}

const miniMongoVectorDocs = miniMongoCollections.find(
  (node) => node.label === "Vector docs",
);
if (
  !miniMongoVectorDocs?.evidence?.some((item) =>
    /createCollectionForVectorSearch\(db, VECTOR_DOCS → "vector_docs"\)/.test(
      item.detail ?? "",
    ),
  )
) {
  fail(
    `mini-mongo Vector docs should evidence createCollectionForVectorSearch(db, VECTOR_DOCS → "vector_docs"); got ${JSON.stringify(
      miniMongoVectorDocs?.evidence?.map((item) => item.detail) ?? [],
    )}`,
  );
} else {
  pass("mini-mongo Vector docs evidenced via createCollectionForVectorSearch helper");
}

if (
  miniMongoVectorDocs?.evidence?.some((item) =>
    /\.collection\(VECTOR_DOCS →/.test(item.detail ?? ""),
  )
) {
  fail(
    "mini-mongo Vector docs must come from the helper only (no bare .collection(VECTOR_DOCS))",
  );
} else {
  pass("mini-mongo Vector docs has no bare .collection(CONST) evidence");
}

const miniMongoCollectionsUnderData = miniMongoCollections.filter(
  (node) => node.parentId === miniMongoData?.id,
);
if (miniMongoCollectionsUnderData.length < 6) {
  fail(
    `mini-mongo expected ≥6 collections nested under Catalog data, found ${miniMongoCollectionsUnderData.length}`,
  );
} else {
  pass(
    `mini-mongo ${miniMongoCollectionsUnderData.length} collections nested under Catalog data`,
  );
}

if (
  miniMongoCollectionsUnderData.some(
    (node) => node.metadata?.collapsedInOverview === true,
  )
) {
  fail("mini-mongo product collections should stay visible on overview");
} else {
  pass("mini-mongo product collections visible under Catalog data on overview");
}

const miniMongoRoutesUnderApi = miniMongoRoutes.filter(
  (node) => node.parentId === miniMongoApi?.id,
);
if (miniMongoRoutesUnderApi.length < 3) {
  fail(
    `mini-mongo expected ≥3 routes nested under Notes API, found ${miniMongoRoutesUnderApi.length}`,
  );
} else {
  pass(`mini-mongo ${miniMongoRoutesUnderApi.length} routes nested under Notes API`);
}

const miniMongoCollapsedRoutes = miniMongoRoutesUnderApi.filter(
  (node) => node.metadata?.collapsedInOverview === true,
);
if (miniMongoCollapsedRoutes.length < 3) {
  fail(
    `mini-mongo overview should collapse routes under Notes API (collapsed=${miniMongoCollapsedRoutes.length})`,
  );
} else {
  pass("mini-mongo overview collapses routes under Notes API");
}

const miniMongoFlow = miniMongoSystems
  .filter((node) => typeof node.metadata?.flowOrder === "number")
  .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
const miniMongoFlowKeys = miniMongoFlow.map((node) => node.metadata.systemKey);
if (
  !miniMongoFlowKeys.includes("api") ||
  !miniMongoFlowKeys.includes("data")
) {
  fail(
    `mini-mongo flowOrder expected Notes API → Catalog data, got ${miniMongoFlow.map((node) => node.label).join(" → ") || "(none)"}`,
  );
} else {
  pass(
    `mini-mongo flowOrder: ${miniMongoFlow.map((node) => node.label).join(" → ")}`,
  );
}

const miniMongoUsesQuery = miniMongoGraph.edges.some(
  (edge) =>
    edge.kind === "uses" &&
    edge.label === "query" &&
    edge.source === miniMongoApi?.id &&
    edge.target === miniMongoData?.id,
);
if (!miniMongoUsesQuery) {
  fail("mini-mongo expected Notes API -[uses:query]-> Catalog data");
} else {
  pass("mini-mongo collaboration: Notes API -[uses:query]-> Catalog data");
}

const miniMongoCommerceNoise = miniMongoGraph.edges.some((edge) =>
  /checkout|orders?/i.test(
    `${edge.label ?? ""} ${edge.metadata?.detail ?? ""}`,
  ),
);
if (miniMongoCommerceNoise) {
  fail("mini-mongo should not inherit Checkout/orders commerce collaboration copy");
} else {
  pass("mini-mongo has no Checkout/orders commerce collaboration noise");
}

const miniMongoMongooseTech = miniMongoCollections.filter(
  (node) => node.technology === "mongoose",
);
if (miniMongoMongooseTech.length < 3) {
  fail(
    `mini-mongo expected ≥3 collections with technology=mongoose, found ${miniMongoMongooseTech.length}`,
  );
} else {
  pass("mini-mongo collections technology=mongoose");
}

const miniMongoVisibleChrome = miniMongoGraph.nodes.filter(
  (node) =>
    node.kind === "module" && node.metadata?.collapsedInOverview !== true,
);
if (miniMongoVisibleChrome.length > 0) {
  fail(
    `mini-mongo modules should collapse on overview, still visible: ${miniMongoVisibleChrome
      .slice(0, 8)
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-mongo module chrome collapsed on overview");
}

// Mongo `.aggregate([...])` → pipeline hubs under Catalog data (RAG/query story).
const miniMongoAggregates = miniMongoGraph.nodes.filter(
  (node) =>
    node.kind === "pipeline" && node.metadata?.mongoAggregate === true,
);
const miniMongoAggregateLabels = new Set(
  miniMongoAggregates.map((node) => node.label),
);
for (const expected of ["Search chunks pipeline", "Note pipeline"]) {
  if (!miniMongoAggregateLabels.has(expected)) {
    fail(
      `mini-mongo missing aggregate pipeline ${expected}; found ${[...miniMongoAggregateLabels].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-mongo has aggregate pipeline ${expected}`);
  }
}

const miniMongoAggregatesUnderData = miniMongoAggregates.filter(
  (node) => node.parentId === miniMongoData?.id,
);
if (miniMongoAggregatesUnderData.length !== 2) {
  fail(
    `mini-mongo expected exactly 2 aggregate pipelines nested under Catalog data, found ${miniMongoAggregatesUnderData.length} (${[...miniMongoAggregateLabels].join(", ")})`,
  );
} else {
  pass(
    `mini-mongo ${miniMongoAggregatesUnderData.length} aggregate pipelines nested under Catalog data`,
  );
}

if (
  miniMongoAggregatesUnderData.some(
    (node) =>
      node.metadata?.overviewHub !== true ||
      node.metadata?.collapsedInOverview === true,
  )
) {
  fail(
    "mini-mongo aggregate pipelines should stay visible on overview (overviewHub)",
  );
} else {
  pass("mini-mongo aggregate pipelines visible as overview hubs under Catalog data");
}

const miniMongoAggregateSteps = miniMongoGraph.nodes.filter(
  (node) =>
    node.kind === "pipeline-step" &&
    typeof node.metadata?.mongoStage === "string",
);
const miniMongoStepLabels = new Set(
  miniMongoAggregateSteps.map((node) => node.label),
);
for (const expected of ["Filter", "Group", "Sort"]) {
  if (!miniMongoStepLabels.has(expected)) {
    fail(
      `mini-mongo missing aggregate stage ${expected}; found ${[...miniMongoStepLabels].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-mongo has aggregate stage ${expected}`);
  }
}

const miniMongoVisibleSteps = miniMongoAggregateSteps.filter(
  (node) => node.metadata?.collapsedInOverview !== true,
);
if (miniMongoVisibleSteps.length > 0) {
  fail(
    `mini-mongo aggregate stages should collapse on overview, still visible: ${miniMongoVisibleSteps
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-mongo aggregate stages collapsed on overview (hubs tell the story)");
}

// Rendered browser: mongo aggregate hubs share the Data constellation with
// collections (laneNameFor routes mongoAggregate → Data & automation).
const miniMongoHtml = renderArchitectureHtml(miniMongoGraph);
if (
  !miniMongoHtml.includes("isMongoAggregateHub") ||
  !miniMongoHtml.includes("Data & automation")
) {
  fail(
    "mini-mongo browser should place mongo aggregate hubs in the Data & automation lane",
  );
} else {
  pass("mini-mongo browser routes mongo aggregate hubs into Data & automation");
}

const miniMongoPipelineUsesCollection = miniMongoGraph.edges.some(
  (edge) =>
    edge.kind === "uses" &&
    edge.label === "query" &&
    miniMongoAggregates.some((pipe) => pipe.id === edge.source) &&
    miniMongoCollections.some((col) => col.id === edge.target),
);
if (!miniMongoPipelineUsesCollection) {
  fail("mini-mongo expected aggregate pipeline -[uses:query]-> collection");
} else {
  pass("mini-mongo aggregate pipeline -[uses:query]-> collection");
}

// ---------------------------------------------------------------------------
// Capability ladder rung 3: real FastAPI repo (pinned SHA, gitignored).
// Golden-lock include_router prefixes, empty-path mounts, product title from
// pyproject, HTTP API + Data nesting/collapse, RealWorld core paths.
// ---------------------------------------------------------------------------
let fastapiRealRoot;
try {
  fastapiRealRoot = await ensureRealRepo(FASTAPI_REALWORLD);
  pass(
    `fastapi real repo ${FASTAPI_REALWORLD.name} ready @ ${FASTAPI_REALWORLD.sha.slice(0, 12)}`,
  );
} catch (error) {
  fail(
    `could not ensure fastapi real repo ${FASTAPI_REALWORLD.name}@${FASTAPI_REALWORLD.sha}: ${error instanceof Error ? error.message : error}`,
  );
}

if (fastapiRealRoot) {
  let fastapiRealGraph;
  try {
    fastapiRealGraph = await compileRepository(fastapiRealRoot);
    pass(
      `fastapi-real-repo scan completed: ${fastapiRealGraph.nodes.length} nodes, ${fastapiRealGraph.edges.length} edges`,
    );
  } catch (error) {
    fail(
      `fastapi-real-repo scan crashed on ${FASTAPI_REALWORLD.name}: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (fastapiRealGraph) {
    const fastapiRoutes = fastapiRealGraph.nodes.filter(
      (node) => node.kind === "route",
    );
    const fastapiSemantic = fastapiRealGraph.nodes.filter(
      (node) => node.metadata?.projection === "semantic",
    );
    const fastapiProduct = fastapiRealGraph.nodes.find(
      (node) => node.kind === "product",
    );
    const fastapiByKey = new Map(
      fastapiSemantic
        .filter((node) => typeof node.metadata?.systemKey === "string")
        .map((node) => [node.metadata.systemKey, node]),
    );
    const fastapiApi = fastapiByKey.get("api");
    const fastapiData = fastapiByKey.get("data");
    const fastapiLabels = new Set(fastapiRoutes.map((node) => node.label));

    console.log(
      `FastAPI-real-repo scan summary: ${JSON.stringify({
        pin: `${FASTAPI_REALWORLD.name}@${FASTAPI_REALWORLD.sha}`,
        product: fastapiProduct?.label ?? null,
        nodes: fastapiRealGraph.nodes.length,
        edges: fastapiRealGraph.edges.length,
        routes: [...fastapiLabels].sort(),
        semantic: fastapiSemantic.map((node) => node.label),
      })}`,
    );

    if (fastapiRealGraph.nodes.length < 40) {
      fail(
        `fastapi-real-repo node floor: ${fastapiRealGraph.nodes.length} < 40 (map looks empty)`,
      );
    } else {
      pass(`fastapi-real-repo nodes: ${fastapiRealGraph.nodes.length}`);
    }

    if (
      !fastapiProduct ||
      fastapiProduct.label !== "FastAPI RealWorld Example App"
    ) {
      fail(
        `fastapi-real-repo product label expected 'FastAPI RealWorld Example App' from pyproject, found '${fastapiProduct?.label ?? "(missing)"}'`,
      );
    } else {
      pass(`fastapi-real-repo product label: ${fastapiProduct.label}`);
    }

    if (!fastapiApi || fastapiApi.label !== "HTTP API") {
      fail(
        `fastapi-real-repo api system label expected 'HTTP API', found '${fastapiApi?.label ?? "(missing)"}'`,
      );
    } else {
      pass("fastapi-real-repo api system labeled 'HTTP API'");
    }

    if (!fastapiData || fastapiData.label !== "Data access") {
      fail(
        `fastapi-real-repo data system label expected 'Data access', found '${fastapiData?.label ?? "(missing)"}'`,
      );
    } else {
      pass("fastapi-real-repo data system labeled 'Data access'");
    }

    // Humanized /api routes for the North star non-coder (params + /api stripped).
    const expectedFastapiRoutes = [
      "POST Users login",
      "POST Users",
      "GET User",
      "PUT User",
      "GET Profiles",
      "POST Profiles follow",
      "DELETE Profiles follow",
      "GET Articles",
      "POST Articles",
      "GET Articles feed",
      "PUT Articles",
      "DELETE Articles",
      "POST Articles favorite",
      "DELETE Articles favorite",
      "GET Articles comments",
      "POST Articles comments",
      "DELETE Articles comments",
      "GET Tags",
    ];
    const missingFastapiRoutes = expectedFastapiRoutes.filter(
      (label) => !fastapiLabels.has(label),
    );
    if (missingFastapiRoutes.length) {
      fail(
        `fastapi-real-repo missing humanized routes: ${missingFastapiRoutes.join(", ")}; found ${[...fastapiLabels].join(", ") || "(none)"}`,
      );
    } else {
      pass(
        `fastapi-real-repo humanized routes: ${expectedFastapiRoutes.length} RealWorld labels`,
      );
    }

    const fastapiRoutesUnderApi = fastapiRoutes.filter(
      (node) => node.parentId === fastapiApi?.id,
    );
    if (fastapiRoutesUnderApi.length < 19) {
      fail(
        `fastapi-real-repo expected ≥19 routes nested under HTTP API, found ${fastapiRoutesUnderApi.length}`,
      );
    } else {
      pass(
        `fastapi-real-repo ${fastapiRoutesUnderApi.length} routes nested under HTTP API`,
      );
    }

    const fastapiCollapsed = fastapiRoutesUnderApi.filter(
      (node) => node.metadata?.collapsedInOverview === true,
    );
    if (fastapiCollapsed.length < 19) {
      fail(
        `fastapi-real-repo routes should collapse on overview under HTTP API: collapsed=${fastapiCollapsed.length}`,
      );
    } else {
      pass(
        "fastapi-real-repo routes collapsed on overview (API tells the story)",
      );
    }

    const fastapiFlow = fastapiSemantic
      .filter((node) => typeof node.metadata?.flowOrder === "number")
      .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
    const fastapiFlowKeys = fastapiFlow.map((node) => node.metadata.systemKey);
    if (
      fastapiFlowKeys[0] !== "api" ||
      fastapiFlowKeys[1] !== "data" ||
      fastapiFlowKeys.length < 2
    ) {
      fail(
        `fastapi-real-repo flowOrder expected HTTP API → Data access, got ${fastapiFlow.map((node) => node.label).join(" → ") || "(none)"}`,
      );
    } else {
      pass(
        `fastapi-real-repo flowOrder: ${fastapiFlow.map((node) => node.label).join(" → ")}`,
      );
    }

    const fastapiFlowsTo = fastapiRealGraph.edges.some(
      (edge) =>
        edge.kind === "flows-to" &&
        edge.source === fastapiApi?.id &&
        edge.target === fastapiData?.id,
    );
    if (!fastapiFlowsTo) {
      fail("fastapi-real-repo missing flows-to edge HTTP API → Data access");
    } else {
      pass("fastapi-real-repo flows-to: HTTP API → Data access");
    }

    const fastapiUsesQuery = fastapiRealGraph.edges.some(
      (edge) =>
        edge.kind === "uses" &&
        edge.label === "query" &&
        edge.source === fastapiApi?.id &&
        edge.target === fastapiData?.id,
    );
    if (!fastapiUsesQuery) {
      fail("fastapi-real-repo expected HTTP API -[uses:query]-> Data access");
    } else {
      pass("fastapi-real-repo collaboration: HTTP API -[uses:query]-> Data access");
    }

    if (!fastapiRealGraph.extractors.some((item) => item.id === "python")) {
      fail("fastapi-real-repo graph.extractors missing python");
    } else {
      pass("fastapi-real-repo registers python extractor");
    }

    const fastapiCommerceNoise = fastapiRealGraph.edges.some((edge) =>
      (edge.evidence || []).some(
        (item) =>
          typeof item.detail === "string" &&
          (item.detail.includes("Checkout") || item.detail.includes("orders")),
      ),
    );
    if (fastapiCommerceNoise) {
      fail(
        "fastapi-real-repo leaked commerce collaboration copy",
      );
    } else {
      pass("fastapi-real-repo has no Checkout/orders commerce collaboration noise");
    }

    // Alembic op.create_table (+ SQLAlchemy/PyPika __table__) → Data access.
    const fastapiTables = fastapiRealGraph.nodes.filter(
      (node) => node.kind === "table",
    );
    const fastapiJoinTables = fastapiTables.filter(
      (node) => node.metadata?.joinTable === true,
    );
    const fastapiProductTables = fastapiTables.filter(
      (node) => node.metadata?.joinTable !== true,
    );
    const fastapiTableLabels = new Set(
      fastapiProductTables.map((node) => node.label),
    );
    console.log(
      `FastAPI-real-repo tables: ${JSON.stringify({
        product: [...fastapiTableLabels].sort(),
        joins: fastapiJoinTables.map((node) => node.label),
      })}`,
    );

    const expectedFastapiTables = ["User", "Article", "Tag", "Comment"];
    const missingFastapiTables = expectedFastapiTables.filter(
      (label) => !fastapiTableLabels.has(label),
    );
    if (missingFastapiTables.length) {
      fail(
        `fastapi-real-repo missing Alembic tables: ${missingFastapiTables.join(", ")}; found ${[...fastapiTableLabels].join(", ") || "(none)"}`,
      );
    } else if (fastapiTableLabels.has("Commentary")) {
      fail("fastapi-real-repo should humanize Commentary → Comment");
    } else {
      pass(
        `fastapi-real-repo product tables: ${expectedFastapiTables.join(", ")}`,
      );
    }

    if (fastapiJoinTables.length < 3) {
      fail(
        `fastapi-real-repo expected ≥3 collapsed join tables (favorites / *_to_*), found ${fastapiJoinTables.length}`,
      );
    } else {
      pass(
        `fastapi-real-repo join tables collapsed: ${fastapiJoinTables.map((n) => n.label).join(", ")}`,
      );
    }

    const fastapiTablesUnderData = fastapiProductTables.filter(
      (node) => node.parentId === fastapiData?.id,
    );
    if (fastapiTablesUnderData.length < 4) {
      fail(
        `fastapi-real-repo expected ≥4 product tables nested under Data access, found ${fastapiTablesUnderData.length}`,
      );
    } else {
      pass(
        `fastapi-real-repo ${fastapiTablesUnderData.length} product tables nested under Data access`,
      );
    }

    const fastapiCollapsedProductTables = fastapiTablesUnderData.filter(
      (node) => node.metadata?.collapsedInOverview === true,
    );
    if (fastapiCollapsedProductTables.length > 0) {
      fail(
        `fastapi-real-repo product tables should stay visible under Data access: ${fastapiCollapsedProductTables.map((n) => n.label).join(", ")}`,
      );
    } else {
      pass("fastapi-real-repo product tables visible under Data access on overview");
    }

    const fastapiMigrates = fastapiRealGraph.edges.filter(
      (edge) =>
        edge.kind === "migrates" &&
        fastapiProductTables.some((table) => table.id === edge.target),
    );
    if (fastapiMigrates.length < 4) {
      fail(
        `fastapi-real-repo expected Alembic migrates → product tables, found ${fastapiMigrates.length}`,
      );
    } else {
      pass(
        `fastapi-real-repo Alembic migrates → ${fastapiMigrates.length} product tables`,
      );
    }

    // Quiet module chrome: overview should be API + Data + product tables only.
    const fastapiVisibleChrome = fastapiRealGraph.nodes.filter(
      (node) =>
        node.kind === "module" && node.metadata?.collapsedInOverview !== true,
    );
    if (fastapiVisibleChrome.length > 0) {
      fail(
        `fastapi-real-repo modules should collapse on overview, still visible: ${fastapiVisibleChrome
          .slice(0, 8)
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass("fastapi-real-repo module chrome collapsed on overview");
    }

    // Relation story from Alembic joins + FK humanization.
    const fastapiTableById = new Map(
      fastapiTables.map((node) => [node.id, node]),
    );
    const fastapiProductRelations = fastapiRealGraph.edges.filter(
      (edge) =>
        edge.kind === "depends-on" &&
        fastapiTableById.has(edge.source) &&
        fastapiTableById.has(edge.target) &&
        !fastapiTableById.get(edge.source)?.metadata?.joinTable &&
        !fastapiTableById.get(edge.target)?.metadata?.joinTable,
    );
    const fastapiRelationSummary = (sourceLabel, targetLabel) =>
      fastapiProductRelations
        .filter(
          (edge) =>
            fastapiTableById.get(edge.source)?.label === sourceLabel &&
            fastapiTableById.get(edge.target)?.label === targetLabel,
        )
        .map((edge) => String(edge.label ?? ""));
    const fastapiUserArticle = fastapiRelationSummary("User", "Article");
    const fastapiArticleUser = fastapiRelationSummary("Article", "User");
    const fastapiUserFollow = fastapiRelationSummary("User", "User");
    const fastapiArticleTag = fastapiRelationSummary("Article", "Tag");
    const fastapiCommentArticle = fastapiRelationSummary("Comment", "Article");
    if (
      !fastapiUserArticle.some((label) => /\bfavorites\b/i.test(label)) ||
      !fastapiUserArticle.some((label) => /\bauthored\b/i.test(label))
    ) {
      fail(
        `fastapi-real-repo missing User→Article authored/favorites, got ${JSON.stringify(fastapiUserArticle)}`,
      );
    } else {
      pass(
        `fastapi-real-repo User→Article data story: ${fastapiUserArticle.join(", ")}`,
      );
    }
    if (
      !fastapiArticleUser.some((label) => /\bfavorited by\b/i.test(label)) ||
      !fastapiArticleUser.some((label) => /\bauthor\b/i.test(label))
    ) {
      fail(
        `fastapi-real-repo missing Article→User author/favorited by, got ${JSON.stringify(fastapiArticleUser)}`,
      );
    } else {
      pass(
        `fastapi-real-repo Article→User data story: ${fastapiArticleUser.join(", ")}`,
      );
    }
    if (!fastapiUserFollow.some((label) => /\bfollows\b/i.test(label))) {
      fail(
        `fastapi-real-repo missing User→User follows, got ${JSON.stringify(fastapiUserFollow)}`,
      );
    } else {
      pass(`fastapi-real-repo User→User follows: ${fastapiUserFollow.join(", ")}`);
    }
    if (!fastapiArticleTag.some((label) => /\btags\b/i.test(label))) {
      fail(
        `fastapi-real-repo missing Article→Tag tags, got ${JSON.stringify(fastapiArticleTag)}`,
      );
    } else {
      pass("fastapi-real-repo Article→Tag humanized to tags");
    }
    if (!fastapiCommentArticle.some((label) => /\bon\b/i.test(label))) {
      fail(
        `fastapi-real-repo missing Comment→Article on, got ${JSON.stringify(fastapiCommentArticle)}`,
      );
    } else {
      pass("fastapi-real-repo Comment→Article relation: on");
    }
  }
}

// ---------------------------------------------------------------------------
// Capability ladder rung 4: real Mongo/Mongoose repo (pinned SHA, gitignored).
// Golden-lock sahat/hackathon-starter collections under Data access + FAQ
// README question headings must not rename HTTP API.
// ---------------------------------------------------------------------------
let mongoRealRoot;
try {
  mongoRealRoot = await ensureRealRepo(HACKATHON_STARTER);
  pass(
    `mongo real repo ${HACKATHON_STARTER.name} ready @ ${HACKATHON_STARTER.sha.slice(0, 12)}`,
  );
} catch (error) {
  fail(
    `could not ensure mongo real repo ${HACKATHON_STARTER.name}@${HACKATHON_STARTER.sha}: ${error instanceof Error ? error.message : error}`,
  );
}

if (mongoRealRoot) {
  let mongoRealGraph;
  try {
    mongoRealGraph = await compileRepository(mongoRealRoot);
    pass(
      `mongo-real-repo scan completed: ${mongoRealGraph.nodes.length} nodes, ${mongoRealGraph.edges.length} edges`,
    );
  } catch (error) {
    fail(
      `mongo-real-repo scan crashed on ${HACKATHON_STARTER.name}: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (mongoRealGraph) {
    const mongoRoutes = mongoRealGraph.nodes.filter(
      (node) => node.kind === "route",
    );
    const mongoCollections = mongoRealGraph.nodes.filter(
      (node) => node.kind === "collection",
    );
    const mongoSemantic = mongoRealGraph.nodes.filter(
      (node) => node.metadata?.projection === "semantic",
    );
    const mongoProduct = mongoRealGraph.nodes.find(
      (node) => node.kind === "product",
    );
    const mongoByKey = new Map(
      mongoSemantic
        .filter((node) => typeof node.metadata?.systemKey === "string")
        .map((node) => [node.metadata.systemKey, node]),
    );
    const mongoApi = mongoByKey.get("api");
    const mongoData = mongoByKey.get("data");
    const mongoCollectionLabels = new Set(
      mongoCollections.map((node) => node.label),
    );

    const mongoSummary = {
      pin: `${HACKATHON_STARTER.name}@${HACKATHON_STARTER.sha}`,
      product: mongoProduct?.label ?? null,
      nodes: mongoRealGraph.nodes.length,
      edges: mongoRealGraph.edges.length,
      routes: mongoRoutes.length,
      collections: [...mongoCollectionLabels].sort(),
      semantic: mongoSemantic.map((node) => node.label),
    };
    console.log(`Mongo-real-repo scan summary: ${JSON.stringify(mongoSummary)}`);

    if (mongoRealGraph.nodes.length < 40) {
      fail(
        `mongo-real-repo node floor: ${mongoRealGraph.nodes.length} < 40 (map looks empty)`,
      );
    } else {
      pass(`mongo-real-repo nodes: ${mongoRealGraph.nodes.length}`);
    }

    if (!mongoProduct || mongoProduct.label !== "Hackathon Starter") {
      fail(
        `mongo-real-repo product label expected 'Hackathon Starter' from README, found '${mongoProduct?.label ?? "(missing)"}'`,
      );
    } else {
      pass(`mongo-real-repo product label: ${mongoProduct.label}`);
    }

    if (!mongoApi || mongoApi.label !== "HTTP API") {
      fail(
        `mongo-real-repo api system label expected 'HTTP API' (FAQ questions must not rename it), found '${mongoApi?.label ?? "(missing)"}'`,
      );
    } else {
      pass("mongo-real-repo api system labeled 'HTTP API'");
    }

    if (!mongoData || mongoData.label !== "Data access") {
      fail(
        `mongo-real-repo data system label expected 'Data access', found '${mongoData?.label ?? "(missing)"}'`,
      );
    } else {
      pass("mongo-real-repo data system labeled 'Data access'");
    }

    if (!mongoRealGraph.extractors.some((item) => item.id === "mongo")) {
      fail("mongo-real-repo graph.extractors missing mongo");
    } else {
      pass("mongo-real-repo registers mongo extractor");
    }

    for (const expected of [
      "User",
      "Session",
      "AI agent checkpoint",
      // controllers/ai.js: const RAG_CHUNKS / LLM_SEMANTIC_CACHE = '…'
      "RAG chunks",
      "LLM semantic cache",
    ]) {
      if (!mongoCollectionLabels.has(expected)) {
        fail(
          `mongo-real-repo missing collection ${expected}; found ${[...mongoCollectionLabels].join(", ") || "(none)"}`,
        );
      } else {
        pass(`mongo-real-repo has collection ${expected}`);
      }
    }

    const mongoConstCollections = mongoCollections.filter((node) =>
      node.evidence?.some((item) =>
        /\.collection\((?:RAG_CHUNKS|LLM_SEMANTIC_CACHE) →/.test(
          item.detail ?? "",
        ),
      ),
    );
    if (mongoConstCollections.length < 2) {
      fail(
        `mongo-real-repo expected RAG_CHUNKS + LLM_SEMANTIC_CACHE via .collection(CONST), found ${mongoConstCollections.length}`,
      );
    } else {
      pass(
        `mongo-real-repo ${mongoConstCollections.length} collections from .collection(CONST)`,
      );
    }

    const mongoVectorHelperCollections = mongoCollections.filter((node) =>
      node.evidence?.some((item) =>
        /createCollectionForVectorSearch\(db, (?:RAG_CHUNKS|LLM_SEMANTIC_CACHE) →/.test(
          item.detail ?? "",
        ),
      ),
    );
    if (mongoVectorHelperCollections.length < 2) {
      fail(
        `mongo-real-repo expected RAG_CHUNKS + LLM_SEMANTIC_CACHE via createCollectionForVectorSearch, found ${mongoVectorHelperCollections.length}; details=${JSON.stringify(
          mongoCollections.flatMap((node) =>
            (node.evidence ?? [])
              .map((item) => item.detail)
              .filter((detail) =>
                String(detail).includes("createCollectionForVectorSearch"),
              ),
          ),
        )}`,
      );
    } else {
      pass(
        `mongo-real-repo ${mongoVectorHelperCollections.length} collections from createCollectionForVectorSearch`,
      );
    }

    const mongoCollectionsUnderData = mongoCollections.filter(
      (node) => node.parentId === mongoData?.id,
    );
    if (mongoCollectionsUnderData.length < 5) {
      fail(
        `mongo-real-repo expected ≥5 collections nested under Data access, found ${mongoCollectionsUnderData.length}`,
      );
    } else {
      pass(
        `mongo-real-repo ${mongoCollectionsUnderData.length} collections nested under Data access`,
      );
    }

    if (
      mongoCollectionsUnderData.some(
        (node) => node.metadata?.collapsedInOverview === true,
      )
    ) {
      fail("mongo-real-repo product collections should stay visible on overview");
    } else {
      pass(
        "mongo-real-repo product collections visible under Data access on overview",
      );
    }

    const mongoRoutesUnderApi = mongoRoutes.filter(
      (node) => node.parentId === mongoApi?.id,
    );
    if (mongoRoutesUnderApi.length < 20) {
      fail(
        `mongo-real-repo expected ≥20 routes nested under HTTP API, found ${mongoRoutesUnderApi.length}`,
      );
    } else {
      pass(
        `mongo-real-repo ${mongoRoutesUnderApi.length} routes nested under HTTP API`,
      );
    }

    const mongoCollapsedRoutes = mongoRoutesUnderApi.filter(
      (node) => node.metadata?.collapsedInOverview === true,
    );
    if (mongoCollapsedRoutes.length < 20) {
      fail(
        `mongo-real-repo routes should collapse on overview under HTTP API: collapsed=${mongoCollapsedRoutes.length}`,
      );
    } else {
      pass(
        "mongo-real-repo routes collapsed on overview (API tells the story)",
      );
    }

    const mongoFlow = mongoSemantic
      .filter((node) => typeof node.metadata?.flowOrder === "number")
      .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
    const mongoFlowKeys = mongoFlow.map((node) => node.metadata.systemKey);
    if (
      mongoFlowKeys[0] !== "api" ||
      mongoFlowKeys[1] !== "data" ||
      mongoFlowKeys.length < 2
    ) {
      fail(
        `mongo-real-repo flowOrder expected HTTP API → Data access, got ${mongoFlow.map((node) => node.label).join(" → ") || "(none)"}`,
      );
    } else {
      pass(
        `mongo-real-repo flowOrder: ${mongoFlow.map((node) => node.label).join(" → ")}`,
      );
    }

    const mongoFlowsTo = mongoRealGraph.edges.some(
      (edge) =>
        edge.kind === "flows-to" &&
        edge.source === mongoApi?.id &&
        edge.target === mongoData?.id,
    );
    if (!mongoFlowsTo) {
      fail("mongo-real-repo missing flows-to edge HTTP API → Data access");
    } else {
      pass("mongo-real-repo flows-to: HTTP API → Data access");
    }

    const mongoUsesQuery = mongoRealGraph.edges.some(
      (edge) =>
        edge.kind === "uses" &&
        edge.label === "query" &&
        edge.source === mongoApi?.id &&
        edge.target === mongoData?.id,
    );
    if (!mongoUsesQuery) {
      fail("mongo-real-repo expected HTTP API -[uses:query]-> Data access");
    } else {
      pass(
        "mongo-real-repo collaboration: HTTP API -[uses:query]-> Data access",
      );
    }

    const mongoCommerceNoise = mongoRealGraph.edges.some((edge) =>
      /checkout|orders?/i.test(
        `${edge.label ?? ""} ${edge.metadata?.detail ?? ""}`,
      ),
    );
    if (mongoCommerceNoise) {
      fail(
        "mongo-real-repo should not inherit Checkout/orders commerce collaboration copy",
      );
    } else {
      pass("mongo-real-repo has no Checkout/orders commerce collaboration noise");
    }

    const mongoMongooseDeclared = mongoCollections.filter(
      (node) =>
        node.technology === "mongoose" &&
        node.evidence?.some((item) =>
          /mongoose\.model\(/.test(item.detail ?? ""),
        ),
    );
    if (mongoMongooseDeclared.length < 2) {
      fail(
        `mongo-real-repo expected ≥2 mongoose.model collections (User/Session), found ${mongoMongooseDeclared.length}`,
      );
    } else {
      pass(
        `mongo-real-repo ${mongoMongooseDeclared.length} collections from mongoose.model`,
      );
    }

    const mongoVisibleChrome = mongoRealGraph.nodes.filter(
      (node) =>
        node.kind === "module" && node.metadata?.collapsedInOverview !== true,
    );
    if (mongoVisibleChrome.length > 0) {
      fail(
        `mongo-real-repo modules should collapse on overview, still visible: ${mongoVisibleChrome
          .slice(0, 8)
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass("mongo-real-repo module chrome collapsed on overview");
    }
  }
}

// ---------------------------------------------------------------------------
// Capability ladder rung 5: OpenAPI extractor + verification/mini-openapi.
// Dual-format golden floors (openapi.yaml + swagger.json) + summary labels.
// ---------------------------------------------------------------------------
const miniOpenapiGraph = await compileRepository(miniOpenapiRoot);
const miniOpenapiRoutes = miniOpenapiGraph.nodes.filter(
  (node) => node.kind === "route" && node.metadata?.openapi === true,
);
const miniOpenapiRouteLabels = miniOpenapiRoutes.map((node) => node.label);
console.log(
  `Mini-openapi graph: ${miniOpenapiGraph.nodes.length} nodes, ${miniOpenapiGraph.edges.length} edges → routes ${[...new Set(miniOpenapiRouteLabels)].sort().join(", ")}`,
);

const miniOpenapiProduct = miniOpenapiGraph.nodes.find(
  (node) => node.kind === "product",
);
if (!miniOpenapiProduct || miniOpenapiProduct.label !== "Mini OpenAPI notes") {
  fail(
    `mini-openapi product label expected 'Mini OpenAPI notes', found '${miniOpenapiProduct?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-openapi product labeled Mini OpenAPI notes");
}

const miniOpenapiExtractors = miniOpenapiGraph.extractors.map(
  (item) => item.id,
);
if (!miniOpenapiExtractors.includes("openapi")) {
  fail(
    `mini-openapi graph.extractors missing openapi; found ${JSON.stringify(miniOpenapiExtractors)}`,
  );
} else {
  pass("mini-openapi registers openapi extractor");
}

const miniOpenapiOps = new Set(
  miniOpenapiRoutes.map(
    (node) => `${node.metadata?.method ?? "?"} ${node.metadata?.path ?? "?"}`,
  ),
);
for (const expected of [
  "GET /notes",
  "POST /notes",
  "GET /notes/{id}",
  "DELETE /notes/{id}",
  "GET /api/tags",
  "POST /api/tags",
]) {
  if (!miniOpenapiOps.has(expected)) {
    fail(
      `mini-openapi missing operation ${expected}; found ${[...miniOpenapiOps].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-openapi has operation ${expected}`);
  }
}

const miniOpenapiYamlRoutes = miniOpenapiRoutes.filter(
  (node) => node.technology === "openapi",
);
const miniOpenapiSwaggerRoutes = miniOpenapiRoutes.filter(
  (node) => node.technology === "swagger",
);
if (miniOpenapiYamlRoutes.length < 4) {
  fail(
    `mini-openapi expected ≥4 openapi.yaml routes, found ${miniOpenapiYamlRoutes.length}`,
  );
} else {
  pass(`mini-openapi dual-format: ${miniOpenapiYamlRoutes.length} OpenAPI 3 routes`);
}
if (miniOpenapiSwaggerRoutes.length < 2) {
  fail(
    `mini-openapi expected ≥2 swagger.json routes, found ${miniOpenapiSwaggerRoutes.length}`,
  );
} else {
  pass(
    `mini-openapi dual-format: ${miniOpenapiSwaggerRoutes.length} Swagger 2 routes (basePath /api)`,
  );
}

for (const expected of [
  "List notes",
  "Create note",
  "Get note",
  "Delete note",
  "List tags",
  "Create tag",
]) {
  if (!miniOpenapiRouteLabels.includes(expected)) {
    fail(
      `mini-openapi missing summary label ${expected}; found ${miniOpenapiRouteLabels.join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-openapi summary label ${expected}`);
  }
}

const miniOpenapiOpIds = new Set(
  miniOpenapiRoutes.map((node) => node.metadata?.operationId).filter(Boolean),
);
for (const expected of [
  "listNotes",
  "createNote",
  "getNote",
  "deleteNote",
  "listTags",
  "createTag",
]) {
  if (!miniOpenapiOpIds.has(expected)) {
    fail(
      `mini-openapi missing operationId ${expected}; found ${[...miniOpenapiOpIds].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-openapi operationId ${expected}`);
  }
}

const miniOpenapiMissingSummary = miniOpenapiRoutes.filter(
  (node) => typeof node.metadata?.summary !== "string" || !node.metadata.summary,
);
if (miniOpenapiMissingSummary.length > 0) {
  fail(
    `mini-openapi routes missing summary metadata: ${miniOpenapiMissingSummary
      .map((node) => node.metadata?.path ?? node.label)
      .join(", ")}`,
  );
} else {
  pass(`mini-openapi ${miniOpenapiRoutes.length} routes carry summary evidence`);
}

const miniOpenapiEvidenceGaps = miniOpenapiRoutes.filter((node) => {
  const detail = node.evidence?.[0]?.detail ?? "";
  const opId = node.metadata?.operationId;
  return !opId || !detail.includes(String(opId));
});
if (miniOpenapiEvidenceGaps.length > 0) {
  fail(
    `mini-openapi evidence should cite operationId: ${miniOpenapiEvidenceGaps
      .map((node) => node.metadata?.operationId ?? node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-openapi evidence details cite operationId");
}

const miniOpenapiSystems = miniOpenapiGraph.nodes.filter(
  (node) => node.metadata?.projection === "semantic",
);
const miniOpenapiByKey = new Map(
  miniOpenapiSystems
    .filter((node) => typeof node.metadata?.systemKey === "string")
    .map((node) => [node.metadata.systemKey, node]),
);
const miniOpenapiApi = miniOpenapiByKey.get("api");
if (!miniOpenapiApi || miniOpenapiApi.label !== "Notes API") {
  fail(
    `mini-openapi API label expected 'Notes API' from README, found '${miniOpenapiApi?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-openapi API labeled Notes API");
}

const nestedOpenapiRoutes = miniOpenapiRoutes.filter(
  (node) => node.parentId === miniOpenapiApi?.id,
);
if (nestedOpenapiRoutes.length < 6) {
  fail(
    `mini-openapi expected ≥6 routes nested under Notes API, found ${nestedOpenapiRoutes.length}`,
  );
} else {
  pass(`mini-openapi ${nestedOpenapiRoutes.length} routes nested under Notes API`);
}

const openapiOverviewLeaves = nestedOpenapiRoutes.filter(
  (node) => node.metadata?.collapsedInOverview !== true,
);
if (openapiOverviewLeaves.length > 0) {
  fail(
    `mini-openapi overview should collapse routes under Notes API, still visible: ${openapiOverviewLeaves
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-openapi overview collapses routes under Notes API");
}

const miniOpenapiFlow = miniOpenapiSystems
  .filter((node) => typeof node.metadata?.flowOrder === "number")
  .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
if (
  miniOpenapiFlow.length < 1 ||
  miniOpenapiFlow[0]?.label !== "Notes API" ||
  miniOpenapiFlow[0]?.metadata?.systemKey !== "api"
) {
  fail(
    `mini-openapi flowOrder expected Notes API, got ${miniOpenapiFlow.map((node) => node.label).join(" → ") || "(none)"}`,
  );
} else {
  pass(
    `mini-openapi flowOrder: ${miniOpenapiFlow.map((node) => node.label).join(" → ")}`,
  );
}

const miniOpenapiSpecModules = miniOpenapiGraph.nodes.filter(
  (node) => node.kind === "module" && node.metadata?.openapiSpec === true,
);
const miniOpenapiSpecLabels = new Set(
  miniOpenapiSpecModules.map((node) => node.label),
);
if (!miniOpenapiSpecLabels.has("openapi.yaml")) {
  fail("mini-openapi missing openapi.yaml spec module");
} else {
  pass("mini-openapi has openapi.yaml spec module");
}
if (!miniOpenapiSpecLabels.has("swagger.json")) {
  fail("mini-openapi missing swagger.json spec module");
} else {
  pass("mini-openapi has swagger.json spec module");
}
const openapiModuleChrome = miniOpenapiSpecModules.filter(
  (node) => node.metadata?.collapsedInOverview !== true,
);
if (openapiModuleChrome.length > 0) {
  fail(
    `mini-openapi overview should collapse spec modules, still visible: ${openapiModuleChrome
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-openapi overview collapses openapi/swagger spec modules");
}

const openapiCommerceNoise = miniOpenapiGraph.edges.some((edge) =>
  /checkout|orders?/i.test(
    `${edge.label ?? ""} ${edge.metadata?.detail ?? ""}`,
  ),
);
if (openapiCommerceNoise) {
  fail(
    "mini-openapi should not inherit Checkout/orders commerce collaboration copy",
  );
} else {
  pass("mini-openapi has no Checkout/orders commerce collaboration noise");
}

// Summary-first labels must stay unique so list/detail path-param twins never
// collide on the canvas (e.g. bare "GET Notes" for both /notes and /notes/{id}).
{
  const miniOpenapiDupLabels = miniOpenapiRouteLabels.filter(
    (label, index) => miniOpenapiRouteLabels.indexOf(label) !== index,
  );
  if (miniOpenapiDupLabels.length > 0) {
    fail(
      `mini-openapi OpenAPI summary labels must be unique (no path-param twin chrome), duplicates: ${[
        ...new Set(miniOpenapiDupLabels),
      ].join(" | ")}`,
    );
  } else {
    pass(
      `mini-openapi ${miniOpenapiRouteLabels.length} summary labels are unique (no twin chrome)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Capability ladder rung 5: real OpenAPI-bearing repo (pinned SHA, gitignored).
// Golden-lock swagger-api/swagger-petstore ops under HTTP API + summary labels.
// ---------------------------------------------------------------------------
let openapiRealRoot;
try {
  openapiRealRoot = await ensureRealRepo(SWAGGER_PETSTORE);
  pass(
    `openapi real repo ${SWAGGER_PETSTORE.name} ready @ ${SWAGGER_PETSTORE.sha.slice(0, 12)}`,
  );
} catch (error) {
  fail(
    `could not ensure openapi real repo ${SWAGGER_PETSTORE.name}@${SWAGGER_PETSTORE.sha}: ${error instanceof Error ? error.message : error}`,
  );
}

if (openapiRealRoot) {
  let openapiRealGraph;
  try {
    openapiRealGraph = await compileRepository(openapiRealRoot);
    pass(
      `openapi-real-repo scan completed: ${openapiRealGraph.nodes.length} nodes, ${openapiRealGraph.edges.length} edges`,
    );
  } catch (error) {
    fail(
      `openapi-real-repo scan crashed on ${SWAGGER_PETSTORE.name}: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (openapiRealGraph) {
    const openapiRealRoutes = openapiRealGraph.nodes.filter(
      (node) => node.kind === "route" && node.metadata?.openapi === true,
    );
    const openapiRealSemantic = openapiRealGraph.nodes.filter(
      (node) => node.metadata?.projection === "semantic",
    );
    const openapiRealProduct = openapiRealGraph.nodes.find(
      (node) => node.kind === "product",
    );
    const openapiRealByKey = new Map(
      openapiRealSemantic
        .filter((node) => typeof node.metadata?.systemKey === "string")
        .map((node) => [node.metadata.systemKey, node]),
    );
    const openapiRealApi = openapiRealByKey.get("api");
    const openapiRealOps = new Set(
      openapiRealRoutes.map(
        (node) =>
          `${node.metadata?.method ?? "?"} ${node.metadata?.path ?? "?"}`,
      ),
    );
    const openapiRealOpIds = new Set(
      openapiRealRoutes
        .map((node) => node.metadata?.operationId)
        .filter(Boolean),
    );
    const openapiRealLabels = new Set(
      openapiRealRoutes.map((node) => node.label),
    );

    const openapiRealSummary = {
      pin: `${SWAGGER_PETSTORE.name}@${SWAGGER_PETSTORE.sha}`,
      product: openapiRealProduct?.label ?? null,
      nodes: openapiRealGraph.nodes.length,
      edges: openapiRealGraph.edges.length,
      routes: openapiRealRoutes.length,
      semantic: openapiRealSemantic.map((node) => node.label),
    };
    console.log(
      `OpenAPI-real-repo scan summary: ${JSON.stringify(openapiRealSummary)}`,
    );

    // README is "Swagger Petstore Sample" (boilerplate); prefer cleaned OpenAPI info.title.
    if (!openapiRealProduct || openapiRealProduct.label !== "Swagger Petstore") {
      fail(
        `openapi-real-repo product label expected 'Swagger Petstore' from OpenAPI info.title, found '${openapiRealProduct?.label ?? "(missing)"}'`,
      );
    } else if (openapiRealProduct.metadata?.labelSource !== "openapi") {
      fail(
        `openapi-real-repo product labelSource expected 'openapi', found '${openapiRealProduct.metadata?.labelSource ?? "(missing)"}'`,
      );
    } else {
      pass(`openapi-real-repo product label: ${openapiRealProduct.label} (OpenAPI info.title)`);
    }

    if (!openapiRealApi || openapiRealApi.label !== "HTTP API") {
      fail(
        `openapi-real-repo api system label expected 'HTTP API', found '${openapiRealApi?.label ?? "(missing)"}'`,
      );
    } else {
      pass("openapi-real-repo api system labeled 'HTTP API'");
    }

    if (!openapiRealGraph.extractors.some((item) => item.id === "openapi")) {
      fail("openapi-real-repo graph.extractors missing openapi");
    } else {
      pass("openapi-real-repo registers openapi extractor");
    }

    if (openapiRealRoutes.length < 19) {
      fail(
        `openapi-real-repo expected ≥19 openapi routes from petstore.yaml, found ${openapiRealRoutes.length}`,
      );
    } else {
      pass(`openapi-real-repo ${openapiRealRoutes.length} OpenAPI routes`);
    }

    for (const expected of [
      "POST /pet",
      "PUT /pet",
      "GET /pet/{petId}",
      "DELETE /pet/{petId}",
      "GET /pet/findByStatus",
      "GET /store/inventory",
      "POST /store/order",
      "GET /store/order/{orderId}",
      "POST /user",
      "GET /user/login",
      "GET /user/logout",
      "GET /user/{username}",
    ]) {
      if (!openapiRealOps.has(expected)) {
        fail(
          `openapi-real-repo missing operation ${expected}; found ${[...openapiRealOps].sort().join(", ") || "(none)"}`,
        );
      } else {
        pass(`openapi-real-repo has operation ${expected}`);
      }
    }

    for (const expected of [
      "addPet",
      "updatePet",
      "getPetById",
      "deletePet",
      "findPetsByStatus",
      "getInventory",
      "placeOrder",
      "getOrderById",
      "createUser",
      "loginUser",
      "logoutUser",
      "getUserByName",
    ]) {
      if (!openapiRealOpIds.has(expected)) {
        fail(
          `openapi-real-repo missing operationId ${expected}; found ${[...openapiRealOpIds].sort().join(", ") || "(none)"}`,
        );
      } else {
        pass(`openapi-real-repo operationId ${expected}`);
      }
    }

    // Summaries keep product vocabulary; trailing periods are stripped for the canvas.
    for (const expected of [
      "Add a new pet to the store",
      "Update an existing pet",
      "Find pet by ID",
      "Deletes a pet",
      "Finds Pets by status",
      "Returns pet inventories by status",
      "Place an order for a pet",
      "Find purchase order by ID",
      "Create user",
      "Logs user into the system",
      "Logs out current logged in user session",
      "Get user by user name",
    ]) {
      if (!openapiRealLabels.has(expected)) {
        fail(
          `openapi-real-repo missing summary label ${JSON.stringify(expected)}; found ${[...openapiRealLabels].sort().join(" | ") || "(none)"}`,
        );
      } else {
        pass(`openapi-real-repo summary label ${expected}`);
      }
    }
    const petstorePeriodLabels = [...openapiRealLabels].filter((label) =>
      /[.。]$/u.test(label),
    );
    if (petstorePeriodLabels.length > 0) {
      fail(
        `openapi-real-repo OpenAPI summary labels should strip trailing periods, still: ${petstorePeriodLabels.join(" | ")}`,
      );
    } else {
      pass("openapi-real-repo OpenAPI summary labels have no trailing periods");
    }

    const nestedPetstoreRoutes = openapiRealRoutes.filter(
      (node) => node.parentId === openapiRealApi?.id,
    );
    if (nestedPetstoreRoutes.length < 19) {
      fail(
        `openapi-real-repo expected ≥19 routes nested under HTTP API, found ${nestedPetstoreRoutes.length}`,
      );
    } else {
      pass(
        `openapi-real-repo ${nestedPetstoreRoutes.length} routes nested under HTTP API`,
      );
    }

    const petstoreOverviewLeaves = nestedPetstoreRoutes.filter(
      (node) => node.metadata?.collapsedInOverview !== true,
    );
    if (petstoreOverviewLeaves.length > 0) {
      fail(
        `openapi-real-repo overview should collapse routes under HTTP API, still visible: ${petstoreOverviewLeaves
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass("openapi-real-repo routes collapsed on overview (API tells the story)");
    }

    const openapiRealFlow = openapiRealSemantic
      .filter((node) => typeof node.metadata?.flowOrder === "number")
      .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
    if (
      openapiRealFlow.length < 1 ||
      openapiRealFlow[0]?.label !== "HTTP API" ||
      openapiRealFlow[0]?.metadata?.systemKey !== "api"
    ) {
      fail(
        `openapi-real-repo flowOrder expected HTTP API, got ${openapiRealFlow.map((node) => node.label).join(" → ") || "(none)"}`,
      );
    } else {
      pass(
        `openapi-real-repo flowOrder: ${openapiRealFlow.map((node) => node.label).join(" → ")}`,
      );
    }

    const petstoreSpecModules = openapiRealGraph.nodes.filter(
      (node) => node.kind === "module" && node.metadata?.openapiSpec === true,
    );
    if (
      !petstoreSpecModules.some((node) =>
        String(node.metadata?.file ?? node.label).endsWith("openapi.yaml"),
      )
    ) {
      fail("openapi-real-repo missing openapi.yaml spec module");
    } else {
      pass("openapi-real-repo has openapi.yaml spec module");
    }
    const petstoreSpecChrome = petstoreSpecModules.filter(
      (node) =>
        node.parentId !== openapiRealApi?.id ||
        node.metadata?.collapsedInOverview !== true,
    );
    if (petstoreSpecChrome.length > 0) {
      fail(
        `openapi-real-repo overview should nest+collapse openapi.yaml under HTTP API, still chrome: ${petstoreSpecChrome
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass("openapi-real-repo overview collapses openapi.yaml under HTTP API");
    }

    const petstoreEvidenceGaps = openapiRealRoutes.filter((node) => {
      const detail = node.evidence?.[0]?.detail ?? "";
      const opId = node.metadata?.operationId;
      return !opId || !detail.includes(String(opId));
    });
    if (petstoreEvidenceGaps.length > 0) {
      fail(
        `openapi-real-repo evidence should cite operationId: ${petstoreEvidenceGaps
          .map((node) => node.metadata?.operationId ?? node.label)
          .join(", ")}`,
      );
    } else {
      pass("openapi-real-repo evidence details cite operationId");
    }

    const petstoreCommerceNoise = openapiRealGraph.edges.some((edge) =>
      /checkout|orders?/i.test(
        `${edge.label ?? ""} ${edge.metadata?.detail ?? ""}`,
      ),
    );
    if (petstoreCommerceNoise) {
      fail(
        "openapi-real-repo should not inherit Checkout/orders commerce collaboration copy",
      );
    } else {
      pass(
        "openapi-real-repo has no Checkout/orders commerce collaboration noise",
      );
    }

    const petstoreModuleChrome = openapiRealGraph.nodes.filter(
      (node) =>
        node.kind === "module" &&
        node.metadata?.collapsedInOverview !== true,
    );
    if (petstoreModuleChrome.length > 0) {
      fail(
        `openapi-real-repo overview should collapse module chrome, still visible: ${petstoreModuleChrome
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass("openapi-real-repo module chrome collapsed on overview");
    }

    // CI/ release scripts must not enter the product map (ignored directory).
    const petstoreCiChrome = openapiRealGraph.nodes.filter((node) => {
      const file = String(
        node.metadata?.file ?? node.qualifiedName ?? node.label ?? "",
      ).replaceAll("\\", "/");
      return (
        /(^|\/)CI\//.test(file) ||
        /\b(ghApiClient|lastRelease|publishRelease|releaseNotes)\.py$/i.test(
          file,
        )
      );
    });
    if (petstoreCiChrome.length > 0) {
      fail(
        `openapi-real-repo should ignore CI/release-script chrome, still: ${petstoreCiChrome
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass("openapi-real-repo ignores CI/release-script module chrome");
    }

    // North-star lock: summary preference keeps every Petstore op distinct —
    // list/detail path params must not collapse into twin canvas labels.
    const petstoreLabelList = openapiRealRoutes.map((node) => node.label);
    const petstoreDupLabels = petstoreLabelList.filter(
      (label, index) => petstoreLabelList.indexOf(label) !== index,
    );
    if (petstoreDupLabels.length > 0) {
      fail(
        `openapi-real-repo OpenAPI summary labels must be unique (no path-param twin chrome), duplicates: ${[
          ...new Set(petstoreDupLabels),
        ].join(" | ")}`,
      );
    } else if (new Set(petstoreLabelList).size !== openapiRealRoutes.length) {
      fail(
        `openapi-real-repo expected ${openapiRealRoutes.length} unique labels, found ${new Set(petstoreLabelList).size}`,
      );
    } else {
      pass(
        `openapi-real-repo ${openapiRealRoutes.length} summary labels are unique (no twin chrome)`,
      );
    }

    // Cold-read: overview should tell "Swagger Petstore → HTTP API" with no
    // competing chrome beside the Product flow band.
    const petstoreOverviewChrome = openapiRealGraph.nodes.filter(
      (node) =>
        node.kind !== "product" &&
        node.metadata?.collapsedInOverview !== true &&
        node.metadata?.systemKey !== "api",
    );
    if (petstoreOverviewChrome.length > 0) {
      fail(
        `openapi-real-repo North-star overview should only show HTTP API, still: ${petstoreOverviewChrome
          .map((node) => `${node.kind}:${node.label}`)
          .join(", ")}`,
      );
    } else {
      pass(
        "openapi-real-repo North-star overview is HTTP API only (Petstore story)",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Rung 5 lock: Express + OpenAPI dual-source nest under one HTTP API system.
// (Petstore pin is contract-only/Java; this tempfile proves dual extractors.)
// ---------------------------------------------------------------------------
{
  const dualRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "underdelta-dual-openapi-"),
  );
  try {
    await fs.writeFile(
      path.join(dualRoot, "README.md"),
      "# Dual Source Notes\n\n## Notes API\n\nExpress handlers plus an OpenAPI contract.\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(dualRoot, "server.js"),
      [
        "const express = require('express');",
        "const app = express();",
        "app.get('/health', (req, res) => res.send('ok'));",
        "app.post('/notes', (req, res) => res.status(201).send('created'));",
        "module.exports = app;",
        "",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(dualRoot, "openapi.yaml"),
      [
        "openapi: 3.0.3",
        "info:",
        "  title: Dual Source Notes",
        "  version: 1.0.0",
        "paths:",
        "  /pets:",
        "    get:",
        "      summary: List pets",
        "      operationId: listPets",
        "      responses:",
        '        "200":',
        "          description: pets",
        "  /pets/{id}:",
        "    get:",
        "      summary: Get pet",
        "      operationId: getPet",
        "      responses:",
        '        "200":',
        "          description: pet",
        "",
      ].join("\n"),
      "utf8",
    );

    const dualGraph = await compileRepository(dualRoot);
    const dualApiSystems = dualGraph.nodes.filter(
      (node) =>
        node.metadata?.projection === "semantic" &&
        node.metadata?.systemKey === "api",
    );
    const dualApi = dualApiSystems[0];
    const dualRoutes = dualGraph.nodes.filter((node) => node.kind === "route");
    const dualOpenapiRoutes = dualRoutes.filter(
      (node) => node.metadata?.openapi === true,
    );
    const dualExpressRoutes = dualRoutes.filter(
      (node) => node.metadata?.openapi !== true,
    );
    const dualNested = dualRoutes.filter(
      (node) => node.parentId === dualApi?.id,
    );
    const dualExtractorIds = (dualGraph.extractors ?? []).map(
      (item) => item.id,
    );

    if (dualApiSystems.length !== 1) {
      fail(
        `dual-source Express+OpenAPI expected exactly 1 API system, found ${dualApiSystems.length}: ${dualApiSystems
          .map((node) => node.label)
          .join(", ") || "(none)"}`,
      );
    } else {
      pass(
        `dual-source Express+OpenAPI nests under one API system (${dualApi.label})`,
      );
    }

    if (
      !dualExtractorIds.includes("typescript") ||
      !dualExtractorIds.includes("openapi")
    ) {
      fail(
        `dual-source expected typescript+openapi extractors, found ${JSON.stringify(dualExtractorIds)}`,
      );
    } else {
      pass("dual-source registers typescript + openapi extractors");
    }

    if (dualExpressRoutes.length < 2) {
      fail(
        `dual-source expected ≥2 Express routes, found ${dualExpressRoutes.length}`,
      );
    } else {
      pass(`dual-source ${dualExpressRoutes.length} Express routes`);
    }

    if (dualOpenapiRoutes.length < 2) {
      fail(
        `dual-source expected ≥2 OpenAPI routes, found ${dualOpenapiRoutes.length}`,
      );
    } else {
      pass(`dual-source ${dualOpenapiRoutes.length} OpenAPI routes`);
    }

    if (!dualApi || dualNested.length !== dualRoutes.length) {
      fail(
        `dual-source expected all ${dualRoutes.length} routes nested under one API, found ${dualNested.length}`,
      );
    } else {
      pass(
        `dual-source ${dualNested.length} Express+OpenAPI routes nested under ${dualApi.label}`,
      );
    }

    const dualOpenapiLabels = dualOpenapiRoutes.map((node) => node.label);
    if (
      !dualOpenapiLabels.includes("List pets") ||
      !dualOpenapiLabels.includes("Get pet")
    ) {
      fail(
        `dual-source missing distinct OpenAPI summary labels List pets / Get pet; found ${dualOpenapiLabels.join(" | ") || "(none)"}`,
      );
    } else {
      pass(
        "dual-source OpenAPI list/detail keep distinct summary labels (no twin chrome)",
      );
    }
  } finally {
    await fs.rm(dualRoot, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Capability ladder rung 6: GraphQL extractor + verification/mini-graphql.
// Thickened golden — SDL + gql dual-source, unique North-star labels, evidence,
// schema + operations.ts module chrome collapsed under Notes API.
// ---------------------------------------------------------------------------
const miniGraphqlGraph = await compileRepository(miniGraphqlRoot);
const miniGraphqlRoutes = miniGraphqlGraph.nodes.filter(
  (node) => node.kind === "route" && node.metadata?.graphql === true,
);
const miniGraphqlRouteLabels = miniGraphqlRoutes.map((node) => node.label);
console.log(
  `Mini-graphql graph: ${miniGraphqlGraph.nodes.length} nodes, ${miniGraphqlGraph.edges.length} edges → ops ${[...new Set(miniGraphqlRouteLabels)].sort().join(", ")}`,
);

const miniGraphqlProduct = miniGraphqlGraph.nodes.find(
  (node) => node.kind === "product",
);
if (!miniGraphqlProduct || miniGraphqlProduct.label !== "Mini GraphQL notes") {
  fail(
    `mini-graphql product label expected 'Mini GraphQL notes', found '${miniGraphqlProduct?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-graphql product labeled Mini GraphQL notes");
}

const miniGraphqlExtractors = miniGraphqlGraph.extractors.map(
  (item) => item.id,
);
if (!miniGraphqlExtractors.includes("graphql")) {
  fail(
    `mini-graphql graph.extractors missing graphql; found ${JSON.stringify(miniGraphqlExtractors)}`,
  );
} else {
  pass("mini-graphql registers graphql extractor");
}

const miniGraphqlFields = new Set(
  miniGraphqlRoutes
    .filter((node) => node.metadata?.sourceKind === "sdl")
    .map((node) => `${node.metadata?.operationType}:${node.metadata?.field}`),
);
for (const expected of [
  "query:notes",
  "query:note",
  "query:tags",
  "mutation:createNote",
  "mutation:deleteNote",
]) {
  if (!miniGraphqlFields.has(expected)) {
    fail(
      `mini-graphql missing SDL field ${expected}; found ${[...miniGraphqlFields].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-graphql has SDL field ${expected}`);
  }
}

const miniGraphqlDocs = new Set(
  miniGraphqlRoutes
    .filter((node) => node.metadata?.sourceKind === "gql")
    .map(
      (node) =>
        `${node.metadata?.operationType}:${node.metadata?.operationName ?? "?"}:${node.metadata?.field ?? "?"}`,
    ),
);
for (const expected of [
  "query:ListNotes:notes",
  "query:GetNote:note",
  "mutation:CreateNote:createNote",
  "mutation:DeleteNote:deleteNote",
]) {
  if (!miniGraphqlDocs.has(expected)) {
    fail(
      `mini-graphql missing gql document ${expected}; found ${[...miniGraphqlDocs].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-graphql has gql document ${expected}`);
  }
}

// SDL keeps Query/Mutation + field; named documents drop the kind so twins
// (createNote ↔ CreateNote) stay distinct on the North-star canvas.
for (const expected of [
  "Query Notes",
  "Query Note",
  "Query Tags",
  "Mutation Create note",
  "Mutation Delete note",
  "List notes",
  "Get note",
  "Create note",
  "Delete note",
]) {
  if (!miniGraphqlRouteLabels.includes(expected)) {
    fail(
      `mini-graphql missing label ${expected}; found ${miniGraphqlRouteLabels.join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-graphql label ${expected}`);
  }
}

const miniGraphqlLabelDupes = miniGraphqlRouteLabels.filter(
  (label, index) => miniGraphqlRouteLabels.indexOf(label) !== index,
);
if (miniGraphqlLabelDupes.length > 0) {
  fail(
    `mini-graphql GraphQL labels must be unique (no SDL+document twin chrome), duplicates: ${[
      ...new Set(miniGraphqlLabelDupes),
    ].join(", ")}`,
  );
} else {
  pass(
    `mini-graphql ${miniGraphqlRouteLabels.length} labels are unique (no twin chrome)`,
  );
}

const miniGraphqlEvidenceGaps = miniGraphqlRoutes.filter((node) => {
  const detail = node.evidence?.[0]?.detail ?? "";
  const field = node.metadata?.field;
  if (typeof field !== "string" || !field) return true;
  if (!detail.includes(`field:${field}`)) return true;
  if (node.metadata?.sourceKind === "gql") {
    const opName = node.metadata?.operationName;
    if (typeof opName !== "string" || !opName) return true;
    if (!detail.includes(opName)) return true;
  }
  return false;
});
if (miniGraphqlEvidenceGaps.length > 0) {
  fail(
    `mini-graphql evidence should cite field/operationName: ${miniGraphqlEvidenceGaps
      .map(
        (node) =>
          `${node.metadata?.operationName ?? node.metadata?.field ?? node.label}`,
      )
      .join(", ")}`,
  );
} else {
  pass("mini-graphql evidence details cite field + operationName");
}

const miniGraphqlSemantic = miniGraphqlGraph.nodes.filter(
  (node) => node.metadata?.projection === "semantic",
);
const miniGraphqlByKey = new Map(
  miniGraphqlSemantic
    .filter((node) => typeof node.metadata?.systemKey === "string")
    .map((node) => [node.metadata.systemKey, node]),
);
const miniGraphqlApi = miniGraphqlByKey.get("api");
if (!miniGraphqlApi || miniGraphqlApi.label !== "Notes API") {
  fail(
    `mini-graphql API label expected 'Notes API' from README, found '${miniGraphqlApi?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-graphql API labeled Notes API");
}

const nestedGraphqlRoutes = miniGraphqlRoutes.filter(
  (node) => node.parentId === miniGraphqlApi?.id,
);
if (nestedGraphqlRoutes.length < 9) {
  fail(
    `mini-graphql expected ≥9 ops nested under Notes API, found ${nestedGraphqlRoutes.length}`,
  );
} else {
  pass(
    `mini-graphql ${nestedGraphqlRoutes.length} ops nested under Notes API`,
  );
}

const nestedGraphqlSdl = nestedGraphqlRoutes.filter(
  (node) => node.metadata?.sourceKind === "sdl",
);
const nestedGraphqlDocs = nestedGraphqlRoutes.filter(
  (node) => node.metadata?.sourceKind === "gql",
);
if (nestedGraphqlSdl.length < 5 || nestedGraphqlDocs.length < 4) {
  fail(
    `mini-graphql expected schema+document ops nested under Notes API (SDL≥5, gql≥4), found SDL ${nestedGraphqlSdl.length} / gql ${nestedGraphqlDocs.length}`,
  );
} else {
  pass(
    `mini-graphql nests schema (${nestedGraphqlSdl.length}) + document (${nestedGraphqlDocs.length}) ops under Notes API`,
  );
}

const graphqlOverviewLeaves = nestedGraphqlRoutes.filter(
  (node) => node.metadata?.collapsedInOverview !== true,
);
if (graphqlOverviewLeaves.length > 0) {
  fail(
    `mini-graphql overview should collapse ops under Notes API, still visible: ${graphqlOverviewLeaves
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-graphql overview collapses ops under Notes API");
}

const miniGraphqlFlow = miniGraphqlSemantic
  .filter((node) => typeof node.metadata?.flowOrder === "number")
  .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
if (
  miniGraphqlFlow.length < 1 ||
  miniGraphqlFlow[0]?.label !== "Notes API"
) {
  fail(
    `mini-graphql flowOrder expected Notes API, got ${miniGraphqlFlow.map((node) => node.label).join(" → ") || "(none)"}`,
  );
} else {
  pass(
    `mini-graphql flowOrder: ${miniGraphqlFlow.map((node) => node.label).join(" → ")}`,
  );
}

const miniGraphqlSpecModules = miniGraphqlGraph.nodes.filter(
  (node) =>
    node.kind === "module" &&
    (node.metadata?.graphqlSpec === true ||
      /\.(?:graphql|gql)$/i.test(node.label)),
);
if (!miniGraphqlSpecModules.some((node) => /schema\.graphql$/i.test(node.label))) {
  fail("mini-graphql missing schema.graphql module");
} else {
  pass("mini-graphql has schema.graphql module");
}

const miniGraphqlOpsModule = miniGraphqlGraph.nodes.find(
  (node) =>
    node.kind === "module" && /(?:^|\/)operations\.ts$/i.test(node.label),
);
if (!miniGraphqlOpsModule) {
  fail("mini-graphql missing operations.ts module (gql document chrome)");
} else {
  pass("mini-graphql has operations.ts module");
}

const graphqlModuleChrome = [
  ...miniGraphqlSpecModules,
  ...(miniGraphqlOpsModule ? [miniGraphqlOpsModule] : []),
].filter((node) => node.metadata?.collapsedInOverview !== true);
if (graphqlModuleChrome.length > 0) {
  fail(
    `mini-graphql overview should collapse schema + ops.ts modules, still visible: ${graphqlModuleChrome
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-graphql overview collapses schema.graphql + operations.ts chrome");
}

const graphqlCommerceNoise = miniGraphqlGraph.edges.some((edge) =>
  /checkout|orders?/i.test(
    `${edge.label ?? ""} ${JSON.stringify(edge.metadata ?? {})}`,
  ),
);
if (graphqlCommerceNoise) {
  fail(
    "mini-graphql should not inherit Checkout/orders commerce collaboration copy",
  );
} else {
  pass("mini-graphql has no Checkout/orders commerce collaboration noise");
}

// ---------------------------------------------------------------------------
// Capability ladder rung 6: real GraphQL SDL repo (pinned SHA, gitignored).
// Golden-lock zth/graphql-client-example-server ops under HTTP API.
// ---------------------------------------------------------------------------
let graphqlRealRoot;
try {
  graphqlRealRoot = await ensureRealRepo(GRAPHQL_CLIENT_EXAMPLE_SERVER);
  pass(
    `graphql real repo ${GRAPHQL_CLIENT_EXAMPLE_SERVER.name} ready @ ${GRAPHQL_CLIENT_EXAMPLE_SERVER.sha.slice(0, 12)}`,
  );
} catch (error) {
  fail(
    `could not ensure graphql real repo ${GRAPHQL_CLIENT_EXAMPLE_SERVER.name}@${GRAPHQL_CLIENT_EXAMPLE_SERVER.sha}: ${error instanceof Error ? error.message : error}`,
  );
}

if (graphqlRealRoot) {
  let graphqlRealGraph;
  try {
    graphqlRealGraph = await compileRepository(graphqlRealRoot);
    pass(
      `graphql-real-repo scan completed: ${graphqlRealGraph.nodes.length} nodes, ${graphqlRealGraph.edges.length} edges`,
    );
  } catch (error) {
    fail(
      `graphql-real-repo scan crashed on ${GRAPHQL_CLIENT_EXAMPLE_SERVER.name}: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (graphqlRealGraph) {
    const graphqlRealRoutes = graphqlRealGraph.nodes.filter(
      (node) => node.kind === "route" && node.metadata?.graphql === true,
    );
    const graphqlRealSemantic = graphqlRealGraph.nodes.filter(
      (node) => node.metadata?.projection === "semantic",
    );
    const graphqlRealProduct = graphqlRealGraph.nodes.find(
      (node) => node.kind === "product",
    );
    const graphqlRealByKey = new Map(
      graphqlRealSemantic
        .filter((node) => typeof node.metadata?.systemKey === "string")
        .map((node) => [node.metadata.systemKey, node]),
    );
    const graphqlRealApi = graphqlRealByKey.get("api");
    const graphqlRealFields = new Set(
      graphqlRealRoutes.map(
        (node) =>
          `${node.metadata?.operationType ?? "?"}:${node.metadata?.field ?? "?"}`,
      ),
    );
    const graphqlRealLabels = graphqlRealRoutes.map((node) => node.label);

    const graphqlRealSummary = {
      pin: `${GRAPHQL_CLIENT_EXAMPLE_SERVER.name}@${GRAPHQL_CLIENT_EXAMPLE_SERVER.sha}`,
      product: graphqlRealProduct?.label ?? null,
      nodes: graphqlRealGraph.nodes.length,
      edges: graphqlRealGraph.edges.length,
      routes: graphqlRealRoutes.length,
      semantic: graphqlRealSemantic.map((node) => node.label),
    };
    console.log(
      `GraphQL-real-repo scan summary: ${JSON.stringify(graphqlRealSummary)}`,
    );

    if (
      !graphqlRealProduct ||
      graphqlRealProduct.label !== "GraphQL Client Example Server"
    ) {
      fail(
        `graphql-real-repo product label expected 'GraphQL Client Example Server', found '${graphqlRealProduct?.label ?? "(missing)"}'`,
      );
    } else {
      pass(`graphql-real-repo product label: ${graphqlRealProduct.label}`);
    }

    if (!graphqlRealApi || graphqlRealApi.label !== "HTTP API") {
      fail(
        `graphql-real-repo api system label expected 'HTTP API', found '${graphqlRealApi?.label ?? "(missing)"}'`,
      );
    } else {
      pass("graphql-real-repo api system labeled 'HTTP API'");
    }

    if (!graphqlRealGraph.extractors.some((item) => item.id === "graphql")) {
      fail("graphql-real-repo graph.extractors missing graphql");
    } else {
      pass("graphql-real-repo registers graphql extractor");
    }

    if (graphqlRealRoutes.length < 15) {
      fail(
        `graphql-real-repo expected ≥15 GraphQL ops from schema.graphql, found ${graphqlRealRoutes.length}`,
      );
    } else {
      pass(`graphql-real-repo ${graphqlRealRoutes.length} GraphQL ops`);
    }

    for (const expected of [
      "query:allTodos",
      "query:todos",
      "query:todosConnection",
      "query:tickets",
      "query:ticketsConnection",
      "query:userById",
      "query:siteStatistics",
      "query:node",
      "mutation:addTodoItem",
      "mutation:updateTodoItem",
      "mutation:deleteTodoItem",
      "mutation:addTodoSimple",
      "mutation:updateTodoSimple",
      "mutation:deleteTodoSimple",
      "subscription:siteStatisticsUpdated",
    ]) {
      if (!graphqlRealFields.has(expected)) {
        fail(
          `graphql-real-repo missing field ${expected}; found ${[...graphqlRealFields].sort().join(", ") || "(none)"}`,
        );
      } else {
        pass(`graphql-real-repo has field ${expected}`);
      }
    }

    for (const expected of [
      "Query All todos",
      "Query Todos",
      "Query Todos connection",
      "Query Tickets",
      "Query User by ID",
      "Query Site statistics",
      "Query Node",
      "Mutation Add todo item",
      "Mutation Update todo item",
      "Mutation Delete todo item",
      "Mutation Add todo simple",
      "Subscription Site statistics updated",
    ]) {
      if (!graphqlRealLabels.includes(expected)) {
        fail(
          `graphql-real-repo missing label ${JSON.stringify(expected)}; found ${[...new Set(graphqlRealLabels)].sort().join(" | ") || "(none)"}`,
        );
      } else {
        pass(`graphql-real-repo label ${expected}`);
      }
    }

    const graphqlRealDupLabels = graphqlRealLabels.filter(
      (label, index) => graphqlRealLabels.indexOf(label) !== index,
    );
    if (graphqlRealDupLabels.length > 0) {
      fail(
        `graphql-real-repo GraphQL labels must be unique, duplicates: ${[
          ...new Set(graphqlRealDupLabels),
        ].join(" | ")}`,
      );
    } else {
      pass(
        `graphql-real-repo ${graphqlRealLabels.length} labels are unique (no twin chrome)`,
      );
    }

    const nestedGraphqlRealRoutes = graphqlRealRoutes.filter(
      (node) => node.parentId === graphqlRealApi?.id,
    );
    if (nestedGraphqlRealRoutes.length < 15) {
      fail(
        `graphql-real-repo expected ≥15 ops nested under HTTP API, found ${nestedGraphqlRealRoutes.length}`,
      );
    } else {
      pass(
        `graphql-real-repo ${nestedGraphqlRealRoutes.length} ops nested under HTTP API`,
      );
    }

    const graphqlRealOverviewLeaves = nestedGraphqlRealRoutes.filter(
      (node) => node.metadata?.collapsedInOverview !== true,
    );
    if (graphqlRealOverviewLeaves.length > 0) {
      fail(
        `graphql-real-repo overview should collapse ops under HTTP API, still visible: ${graphqlRealOverviewLeaves
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass(
        "graphql-real-repo routes collapsed on overview (API tells the story)",
      );
    }

    const graphqlRealFlow = graphqlRealSemantic
      .filter((node) => typeof node.metadata?.flowOrder === "number")
      .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
    const graphqlRealFlowKeys = graphqlRealFlow.map(
      (node) => node.metadata?.systemKey,
    );
    if (
      graphqlRealFlow.length !== 1 ||
      graphqlRealFlowKeys[0] !== "api"
    ) {
      fail(
        `graphql-real-repo flowOrder expected HTTP API only, got ${graphqlRealFlow.map((node) => node.label).join(" → ") || "(none)"}`,
      );
    } else {
      pass(
        `graphql-real-repo flowOrder is HTTP API only: ${graphqlRealFlow.map((node) => node.label).join(" → ")}`,
      );
    }

    // Path-role chrome: bare schema.ts must fold under HTTP API (not invent a
    // competing Schema contract); empty bin CLI + table-less Data stay collapsed.
    const graphqlRealSchemaSystem = graphqlRealSemantic.find(
      (node) => node.metadata?.systemKey === "schema",
    );
    if (graphqlRealSchemaSystem) {
      fail(
        `graphql-real-repo should fold Schema contract into HTTP API, still: ${graphqlRealSchemaSystem.label}`,
      );
    } else {
      pass("graphql-real-repo has no Schema contract system (folded into HTTP API)");
    }
    const graphqlRealSchemaModule = graphqlRealGraph.nodes.find(
      (node) =>
        node.kind === "module" && /(?:^|\/)schema\.ts$/i.test(node.label),
    );
    if (
      !graphqlRealSchemaModule ||
      graphqlRealSchemaModule.parentId !== graphqlRealApi?.id ||
      graphqlRealSchemaModule.metadata?.collapsedInOverview !== true
    ) {
      fail(
        `graphql-real-repo schema.ts should nest+collapse under HTTP API, found parent=${graphqlRealSchemaModule?.parentId ?? "(missing)"} collapsed=${graphqlRealSchemaModule?.metadata?.collapsedInOverview}`,
      );
    } else {
      pass("graphql-real-repo schema.ts nested+collapsed under HTTP API");
    }
    const graphqlRealCli = graphqlRealByKey.get("cli");
    if (!graphqlRealCli || graphqlRealCli.metadata?.collapsedInOverview !== true) {
      fail(
        `graphql-real-repo empty bin CLI should collapse on overview, found ${graphqlRealCli ? `collapsed=${graphqlRealCli.metadata?.collapsedInOverview}` : "(missing)"}`,
      );
    } else {
      pass("graphql-real-repo empty CLI collapsed on overview");
    }
    const graphqlRealData = graphqlRealByKey.get("data");
    if (!graphqlRealData || graphqlRealData.metadata?.collapsedInOverview !== true) {
      fail(
        `graphql-real-repo table-less Data access should collapse on overview, found ${graphqlRealData ? `collapsed=${graphqlRealData.metadata?.collapsedInOverview}` : "(missing)"}`,
      );
    } else {
      pass("graphql-real-repo table-less Data access collapsed on overview");
    }

    const graphqlRealSpecModules = graphqlRealGraph.nodes.filter(
      (node) =>
        node.kind === "module" &&
        (node.metadata?.graphqlSpec === true ||
          /\.(?:graphql|gql)$/i.test(node.label)),
    );
    if (
      !graphqlRealSpecModules.some((node) => /schema\.graphql$/i.test(node.label))
    ) {
      fail("graphql-real-repo missing schema.graphql module");
    } else {
      pass("graphql-real-repo has schema.graphql module");
    }
    const graphqlRealSpecChrome = graphqlRealSpecModules.filter(
      (node) =>
        node.parentId !== graphqlRealApi?.id ||
        node.metadata?.collapsedInOverview !== true,
    );
    if (graphqlRealSpecChrome.length > 0) {
      fail(
        `graphql-real-repo overview should nest+collapse schema.graphql under HTTP API, still chrome: ${graphqlRealSpecChrome
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass(
        "graphql-real-repo overview collapses schema.graphql under HTTP API",
      );
    }

    const graphqlRealEvidenceGaps = graphqlRealRoutes.filter((node) => {
      const detail = node.evidence?.[0]?.detail ?? "";
      const field = node.metadata?.field;
      return !field || !detail.includes(`field:${field}`);
    });
    if (graphqlRealEvidenceGaps.length > 0) {
      fail(
        `graphql-real-repo evidence should cite field: ${graphqlRealEvidenceGaps
          .map((node) => node.metadata?.field ?? node.label)
          .join(", ")}`,
      );
    } else {
      pass("graphql-real-repo evidence details cite field:");
    }

    const graphqlRealCommerceNoise = graphqlRealGraph.edges.some((edge) =>
      /checkout|orders?/i.test(
        `${edge.label ?? ""} ${JSON.stringify(edge.metadata ?? {})}`,
      ),
    );
    if (graphqlRealCommerceNoise) {
      fail(
        "graphql-real-repo should not inherit Checkout/orders commerce collaboration copy",
      );
    } else {
      pass(
        "graphql-real-repo has no Checkout/orders commerce collaboration noise",
      );
    }

    // Cold-read: overview should tell "GraphQL Client Example Server → HTTP API"
    // with CLI/Schema/Data chrome quiet (viewer also hides function/module leaves).
    const graphqlOverviewHiddenKinds = new Set([
      "function",
      "column",
      "module",
      "pipeline-step",
    ]);
    const graphqlRealOverviewChrome = graphqlRealGraph.nodes.filter(
      (node) =>
        node.kind !== "product" &&
        !graphqlOverviewHiddenKinds.has(node.kind) &&
        node.metadata?.collapsedInOverview !== true &&
        node.metadata?.systemKey !== "api",
    );
    if (graphqlRealOverviewChrome.length > 0) {
      fail(
        `graphql-real-repo North-star overview should only show HTTP API, still: ${graphqlRealOverviewChrome
          .map((node) => `${node.kind}:${node.label}`)
          .join(", ")}`,
      );
    } else {
      pass(
        "graphql-real-repo North-star overview is HTTP API only (GraphQL story)",
      );
    }
  }
}

if (process.exitCode) {
  console.error("Verification suite failed.");
  process.exit(process.exitCode);
}

console.log("Verification suite passed.");
