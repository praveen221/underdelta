#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileRepository } from "../dist/compile.js";
import { renderArchitectureHtml } from "../dist/viewer.js";
import {
  ensureRealRepo,
  REALWORLD_EXPRESS,
} from "./ensure-real-repo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const fixtureRoot = path.join(repoRoot, "verification", "mini-stack");
const miniNextRoot = path.join(repoRoot, "verification", "mini-next");

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
for (const expected of ["GET /api/posts", "POST /api/posts", "GET /api/health"]) {
  if (!miniNextRouteLabels.has(expected)) {
    fail(
      `mini-next missing route ${expected}; found ${[...miniNextRouteLabels].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-next has route ${expected}`);
  }
}

const miniNextPages = miniNextGraph.nodes.filter((node) => node.kind === "page");
const miniNextPageLabels = new Set(miniNextPages.map((node) => node.label));
if (!miniNextPageLabels.has("Home") || !miniNextPageLabels.has("/dashboard")) {
  fail(
    `mini-next expected Home + /dashboard pages, found ${[...miniNextPageLabels].join(", ") || "(none)"}`,
  );
} else {
  pass("mini-next App Router pages: Home, /dashboard");
}

const miniNextClientComponents = miniNextGraph.nodes.filter(
  (node) =>
    node.kind === "component" &&
    (node.metadata?.clientComponent === true || node.metadata?.runtime === "client"),
);
if (miniNextClientComponents.length < 2) {
  fail(
    `mini-next expected >=2 client components (use client), found ${miniNextClientComponents.length}`,
  );
} else {
  pass(
    `mini-next client components: ${miniNextClientComponents.map((node) => node.label).sort().join(", ")}`,
  );
}

const miniNextServerActions = miniNextGraph.nodes.filter(
  (node) => node.metadata?.serverAction === true,
);
const miniNextServerActionLabels = new Set(
  miniNextServerActions.map((node) => node.label),
);
if (
  !miniNextServerActionLabels.has("createPost") ||
  !miniNextServerActionLabels.has("deletePost")
) {
  fail(
    `mini-next missing server actions createPost/deletePost; found ${[...miniNextServerActionLabels].join(", ") || "(none)"}`,
  );
} else {
  pass("mini-next server actions: createPost, deletePost");
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

if (process.exitCode) {
  console.error("Verification suite failed.");
  process.exit(process.exitCode);
}

console.log("Verification suite passed.");
