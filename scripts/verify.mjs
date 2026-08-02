#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileRepository } from "../dist/compile.js";
import { renderArchitectureHtml } from "../dist/viewer.js";

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
if (!cron || !String(cron.label).includes("reconcilePayments")) {
  fail(
    `expected humanized cron label with handler name, found '${cron?.label ?? "(none)"}'`,
  );
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
const importsFilter = viewerHtml.indexOf(
  "importsAndCalls = connections.filter",
);
const collaborationItemFn = viewerHtml.indexOf("function collaborationItem");
const edgeDetailTextFn = viewerHtml.indexOf("function edgeDetailText");
const collabDetailClass = viewerHtml.indexOf('class="collab-detail"');
const collabUsesCollaborationItem = viewerHtml.includes(
  "collaboration.slice(0, 16).map((edge) => collaborationItem(edge, id))",
);
if (collaborationKindsDecl < 0 || usesInKinds < 0 || rendersInKinds < 0 || exposesInKinds < 0) {
  fail("viewer missing collaborationKinds set for inspector (uses/renders/exposes)");
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
const edgeBadgeClass = fixtureViewerHtml.indexOf('class="edge-badge"');
const narrativeLegend = fixtureViewerHtml.indexOf('class="narrative">publishes / migrates');
const suppressContainsNearNarrative = fixtureViewerHtml.includes(
  'edge.kind === "contains" &&',
) && fixtureViewerHtml.includes("narrativePairs.has");
const dataNarrativeAttr = fixtureViewerHtml.indexOf('data-narrative", "true"');
if (
  narrativeKindsDecl < 0 ||
  narrativeBadgeFn < 0 ||
  narrativeCss < 0 ||
  narrativePublishesCss < 0 ||
  narrativeMigratesCss < 0 ||
  edgeBadgeClass < 0 ||
  narrativeLegend < 0 ||
  dataNarrativeAttr < 0
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

// Canvas: on selection, badge collaboration + table↔table relation labels
// (flows-to stays unlabeled — Product flow band already tells that story).
const selectionBadgeFn = viewerHtml.indexOf("function selectionEdgeBadgeLabel");
const selectionBadgeSkipFlowsTo =
  viewerHtml.includes('if (edge.kind === "flows-to") return null') &&
  selectionBadgeFn >= 0;
const selectionBadgeUsesCollab =
  viewerHtml.includes("collaborationKinds.has(edge.kind)") &&
  viewerHtml.includes("selectionEdgeBadgeLabel(edge)");
const selectionBadgeTableRelation =
  viewerHtml.includes("isTableRelationEdge(edge)") &&
  viewerHtml.includes("relationLabelText(edge)") &&
  selectionBadgeFn >= 0;
const selectionLabelAttr = viewerHtml.indexOf('data-selection-label", "true"');
const selectionBadgeGroupClass = viewerHtml.indexOf(
  'selectionOnly ? "edge-badge-group selection" : "edge-badge-group"',
);
const selectionBadgeOnlyWhenSelected =
  viewerHtml.includes("if (selected) {") &&
  viewerHtml.includes("const badge = selectionEdgeBadgeLabel(edge)");
if (
  selectionBadgeFn < 0 ||
  !selectionBadgeSkipFlowsTo ||
  !selectionBadgeUsesCollab ||
  !selectionBadgeTableRelation ||
  selectionLabelAttr < 0 ||
  selectionBadgeGroupClass < 0 ||
  !selectionBadgeOnlyWhenSelected
) {
  fail(
    "viewer canvas should label collaboration + table relation edges on selection (not always-on, skip flows-to)",
  );
} else {
  pass(
    "viewer canvas shows collaboration/relation edge labels on selection so founders read meaning without the inspector",
  );
}

if (process.exitCode) {
  console.error("Verification suite failed.");
  process.exit(process.exitCode);
}

console.log("Verification suite passed.");
