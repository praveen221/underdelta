#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileRepository } from "../dist/compile.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const fixtureRoot = path.join(repoRoot, "verification", "mini-stack");

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
        file.includes("mini-stack/")
      );
    })
    .map((item) => `${node.kind}:${node.label} <- ${item.file}`),
);

if (leaked.length > 0) {
  fail(
    `default product scan leaked verification evidence:\n  ${leaked.slice(0, 20).join("\n  ")}`,
  );
} else {
  pass("default product scan excludes verification/");
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

function requireCollab(kind, fromLabel, toLabel) {
  const from = selfGraph.nodes.find(
    (node) =>
      node.label === fromLabel && node.metadata?.projection === "semantic",
  );
  const to = selfGraph.nodes.find(
    (node) =>
      node.label === toLabel && node.metadata?.projection === "semantic",
  );
  const found =
    from &&
    to &&
    selfGraph.edges.some(
      (edge) =>
        edge.kind === kind && edge.source === from.id && edge.target === to.id,
    );
  if (!found) {
    fail(`missing collaboration edge ${fromLabel} -[${kind}]-> ${toLabel}`);
  } else {
    pass(`collaboration: ${fromLabel} -[${kind}]-> ${toLabel}`);
  }
}

requireCollab("uses", "Compile pipeline", "Extractors");
requireCollab("uses", "Compile pipeline", "Graph assembly");
requireCollab("uses", "Compile pipeline", "Schema contract");
requireCollab("renders", "Viewer", "Graph assembly");
requireCollab("renders", "Viewer", "architecture.json");
requireCollab("exposes", "CLI", "architecture.json");
requireCollab("exposes", "CLI", "index.html");
requireCollab("triggers", "CLI", "Compile pipeline");
requireCollab("configures", "Schema contract", "Extractors");

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
const requiredExtractors = ["prisma", "sql", "typescript"];
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
  "src/extractors/prisma.ts",
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

const fixtureLabels = new Set(fixtureSystems.map((node) => node.label));
for (const expected of [
  "HTTP API",
  "Scheduled jobs",
  "Queue workers",
  "Pipelines",
  "Data access",
  "UI",
]) {
  if (!fixtureLabels.has(expected)) {
    fail(`fixture self-map missing semantic node '${expected}'`);
  } else {
    pass(`fixture has '${expected}'`);
  }
}

const fixtureTables = fixtureGraph.nodes.filter((node) => node.kind === "table");
// After projection, Order/order/orders and Payment/payment/payments collapse.
if (fixtureTables.length > 4) {
  fail(
    `expected deduped tables (<=4), found ${fixtureTables.length}: ${fixtureTables
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass(`fixture tables deduped to ${fixtureTables.length}`);
}

const api = fixtureSystems.find((node) => node.label === "HTTP API");
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
  fail("expected HTTP API system to contain route nodes");
} else {
  pass(`HTTP API contains ${routesUnderApi} route(s)`);
}

const cron = fixtureGraph.nodes.find((node) => node.kind === "cron");
if (!cron || !String(cron.label).includes("reconcilePayments")) {
  fail(
    `expected humanized cron label with handler name, found '${cron?.label ?? "(none)"}'`,
  );
} else {
  pass(`cron label humanized: ${cron.label}`);
}

const pipelines = fixtureSystems.find((node) => node.label === "Pipelines");
const checkout = fixtureGraph.nodes.find(
  (node) =>
    node.kind === "pipeline" &&
    node.label === "checkout" &&
    node.metadata?.projection !== "semantic",
);
if (!pipelines || !checkout || checkout.parentId !== pipelines.id) {
  fail("expected extracted checkout pipeline nested under Pipelines system");
} else {
  pass("checkout pipeline nested under Pipelines");
}

const collapsedRoutes = fixtureGraph.nodes.filter(
  (node) => node.kind === "route" && node.metadata?.collapsedInOverview === true,
);
if (collapsedRoutes.length < 2) {
  fail(
    `expected routes collapsed in overview under HTTP API, found ${collapsedRoutes.length}`,
  );
} else {
  pass(`collapsed overview leaves: ${collapsedRoutes.length} route(s)`);
}

if (checkout && checkout.metadata?.collapsedInOverview !== true) {
  fail("expected checkout pipeline collapsed in overview under Pipelines");
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

const workers = fixtureSystems.find((node) => node.label === "Queue workers");
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
  fail("expected HTTP API system to publish to fulfillment queue");
} else {
  pass("HTTP API publishes to fulfillment");
}
if (!workersConsume) {
  fail("expected Queue workers system to consume fulfillment queue");
} else {
  pass("Queue workers consume fulfillment");
}

if (process.exitCode) {
  console.error("Verification suite failed.");
  process.exit(process.exitCode);
}

console.log("Verification suite passed.");
