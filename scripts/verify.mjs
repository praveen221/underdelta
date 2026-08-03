#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileRepository } from "../dist/compile.js";
import { renderArchitectureHtml } from "../dist/viewer.js";
import {
  ensureRealRepo,
  EXAMPLE_VOTING_APP,
  FASTAPI_REALWORLD,
  GRAPHQL_CLIENT_EXAMPLE_SERVER,
  HACKATHON_STARTER,
  HELM_EXAMPLES,
  MICROSERVICES_DEMO,
  NEXTJS_SAAS_STARTER,
  PODINFO,
  REALWORLD_EXPRESS,
  SWAGGER_PETSTORE,
  TERRAFORM_AWS_VPC,
} from "./ensure-real-repo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const fixtureRoot = path.join(repoRoot, "verification", "mini-stack");
const miniNextRoot = path.join(repoRoot, "verification", "mini-next");
const miniPythonRoot = path.join(repoRoot, "verification", "mini-python");
const miniMongoRoot = path.join(repoRoot, "verification", "mini-mongo");
const miniOpenapiRoot = path.join(repoRoot, "verification", "mini-openapi");
const miniGraphqlRoot = path.join(repoRoot, "verification", "mini-graphql");
const miniDockerRoot = path.join(repoRoot, "verification", "mini-docker");
const miniTerraformRoot = path.join(repoRoot, "verification", "mini-terraform");
const miniK8sRoot = path.join(repoRoot, "verification", "mini-k8s");
const miniHelmRoot = path.join(repoRoot, "verification", "mini-helm");
const miniKustomizeRoot = path.join(repoRoot, "verification", "mini-kustomize");

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
        file.includes("mini-docker/") ||
        file.includes("mini-terraform/") ||
        file.includes("mini-k8s/") ||
        file.includes("mini-helm/") ||
        file.includes("mini-kustomize/") ||
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
  "docker",
  "graphql",
  "helm",
  "kubernetes",
  "kustomize",
  "mongo",
  "openapi",
  "prisma",
  "python",
  "sql",
  "terraform",
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
  "src/extractors/docker.ts",
  "src/extractors/graphql.ts",
  "src/extractors/helm.ts",
  "src/extractors/kubernetes.ts",
  "src/extractors/kustomize.ts",
  "src/extractors/mongo.ts",
  "src/extractors/openapi.ts",
  "src/extractors/prisma.ts",
  "src/extractors/python.ts",
  "src/extractors/sql.ts",
  "src/extractors/terraform.ts",
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
    node.kind === "capability" &&
    node.metadata?.role === "extractor" &&
    requiredExtractors.includes(node.label),
);
if (extractorChildren.length < requiredExtractors.length) {
  fail(
    `expected Extractors capability children ${requiredExtractors.join(", ")}, found ${JSON.stringify(extractorChildren.map((node) => `${node.kind}:${node.label}`))}`,
  );
} else {
  pass(
    `Extractors capabilities: ${extractorChildren.map((node) => node.label).sort().join(", ")}`,
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
    `expected cron scheduleHub=true so jobs stay available at Intermediate, found ${JSON.stringify(
      cron?.metadata ?? null,
    )}`,
  );
} else if (cron.metadata?.collapsedInOverview === true) {
  fail(
    "cron schedule hub should not be collapsedInOverview (Intermediate reveals it; Beginner hides via intermediateKinds)",
  );
} else {
  pass("cron schedule hub available at Intermediate (not collapsedInOverview)");
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
  fail(
    "messaging hub queue should not be collapsedInOverview (Intermediate reveals it; Beginner hides via intermediateKinds)",
  );
} else {
  pass("fulfillment queue available at Intermediate (not collapsedInOverview)");
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

// Walkable graph: Beginner / Intermediate / Advanced tier control (not Details on/off).
if (
  !viewerHtml.includes('id="tier"') ||
  !viewerHtml.includes("View: Beginner") ||
  !viewerHtml.includes('tierOrder = ["beginner", "intermediate", "advanced"]') ||
  viewerHtml.includes("Details: off") ||
  viewerHtml.includes('id="implementation"')
) {
  fail(
    "viewer should expose Beginner/Intermediate/Advanced tier control (id=tier), not Details on/off",
  );
} else if (
  !viewerHtml.includes("isAdvancedTier()") ||
  !viewerHtml.includes("function showsAdvancedKind(node)") ||
  !viewerHtml.includes("!showsAdvancedKind(node)")
) {
  fail(
    "viewer Advanced tier must use showsAdvancedKind (focus-scoped; no whole-repo dump)",
  );
} else if (
  !viewerHtml.includes("code in focus") ||
  !viewerHtml.includes("View: Advanced · code in focus")
) {
  fail(
    "viewer Advanced-in-focus must surface clear 'code in focus' tier/crumb copy",
  );
} else if (
  !viewerHtml.includes("const intermediateKinds = new Set([") ||
  !viewerHtml.includes("intermediateKinds.has(node.kind)") ||
  !viewerHtml.includes("hasProductFlow") ||
  !viewerHtml.includes("calmOverview")
) {
  fail(
    "viewer Beginner cold open must hide intermediateKinds and gate on Product Flow",
  );
} else if (
  !viewerHtml.includes("function focusNeighborhood(rootId)") ||
  !viewerHtml.includes("focusNeighborhood(state.focus)") ||
  !viewerHtml.includes("neighborhoodEdgeKinds")
) {
  fail(
    "viewer Intermediate focus must use focusNeighborhood (contains + story neighbors), not whole-repo uncollapse",
  );
} else if (
  !viewerHtml.includes("syncTierToFocus()") ||
  !viewerHtml.includes('id="focus-crumb"')
) {
  fail(
    "viewer focus should sync tier via syncTierToFocus and show a Focus crumb",
  );
} else if (
  !viewerHtml.includes("function focusStack()") ||
  !viewerHtml.includes("function navigateFocusStack(index)") ||
  !viewerHtml.includes("function goOverview()") ||
  !viewerHtml.includes('data-stack="-1"') ||
  !viewerHtml.includes("Back to Beginner overview") ||
  !viewerHtml.includes("crumb-sep")
) {
  fail(
    "viewer navigation must expose Overview › focus breadcrumb + navigateFocusStack (Back → Intermediate then Beginner)",
  );
} else if (
  !viewerHtml.includes("function goBack()") ||
  !viewerHtml.includes("navigateFocusStack(stack.length - 2)") ||
  !viewerHtml.includes("document.getElementById(\"overview\").onclick = () => goOverview()") ||
  !viewerHtml.includes('document.getElementById("back").onclick = () =>')
) {
  fail(
    "viewer Back/Overview must use goBack / navigateFocusStack / goOverview so tier stays in sync",
  );
} else if (
  !viewerHtml.includes("function handleEscapeKey(event)") ||
  !viewerHtml.includes('event.key !== "Escape"') ||
  !viewerHtml.includes('document.addEventListener("keydown", handleEscapeKey)') ||
  !viewerHtml.includes("if (goBack())") ||
  !viewerHtml.includes("Back / Esc returns")
) {
  fail(
    "viewer Esc must call goBack (one focus-stack step) after clearing search when typing",
  );
} else if (
  !viewerHtml.includes("function clusterRootFor(id)") ||
  !viewerHtml.includes("function enterSearchMatch(matchId)") ||
  !viewerHtml.includes("function searchMatchNodes()") ||
  !viewerHtml.includes("function handleSearchKeydown(event)") ||
  !viewerHtml.includes('id="search-results"') ||
  !viewerHtml.includes("Enter enters its cluster") ||
  !viewerHtml.includes("const calmOverview = !state.focus;") ||
  viewerHtml.includes("const calmOverview = !state.focus && !query;")
) {
  fail(
    "viewer Search must enter a match’s cluster (clusterRootFor/enterSearchMatch) without query dumping the god-graph",
  );
} else if (
  !viewerHtml.includes("sessionStorage") ||
  !viewerHtml.includes("walkStorageKey") ||
  !viewerHtml.includes("function persistWalkState()") ||
  !viewerHtml.includes("function restoreWalkState()") ||
  !viewerHtml.includes('sessionStorage.setItem(walkStorageKey') ||
  !viewerHtml.includes("sessionStorage.getItem(walkStorageKey)") ||
  !viewerHtml.includes("restoreWalkState()") ||
  !viewerHtml.includes("persistWalkState()")
) {
  fail(
    "viewer must persist last tier/focus in sessionStorage (persistWalkState/restoreWalkState) for reload comfort",
  );
} else if (
  !viewerHtml.includes("function emptyInspectorMessage()") ||
  !viewerHtml.includes("function walkHintText()") ||
  !viewerHtml.includes('id="walk-hint"') ||
  !viewerHtml.includes("Beginner · Product Flow") ||
  !viewerHtml.includes('name: "Code"') ||
  viewerHtml.includes('name: "Details"') ||
  viewerHtml.includes('lane.name !== "Details"')
) {
  fail(
    "viewer legend/inspector empty-state copy must match tiers (walk-hint + emptyInspectorMessage; Code lane, not Details)",
  );
} else if (
  !viewerHtml.includes("function showsStructuralEdge(edge)") ||
  !viewerHtml.includes("ownershipEdgeKinds") ||
  !viewerHtml.includes('ownershipEdgeKinds = new Set(["contains"])') ||
  !viewerHtml.includes("structuralHairlineKinds") ||
  !viewerHtml.includes('edge.structural') ||
  !viewerHtml.includes('data-structural') ||
  !viewerHtml.includes("if (!showsStructuralEdge(edge)) continue")
) {
  fail(
    "viewer Intermediate must collapse ownership contains fans and quiet/gate derived structural hairlines (showsStructuralEdge)",
  );
} else {
  pass("viewer Walkable tiers: Beginner / Intermediate / Advanced (cluster-scoped Advanced)");
  pass("viewer navigation: breadcrumb + Back/Overview + Esc tier sync");
  pass("viewer Search Enter/click enters cluster (no query god-graph dump)");
  pass("viewer sessionStorage persists last tier/focus for reload comfort");
  pass("viewer tier copy: walk-hint + emptyInspectorMessage + Code lane");
  pass("viewer Intermediate edge calm: ownership fans collapsed + structural hairlines gated");
}

// Beginner cold-open floor: Product Flow + top systems; no advanced or intermediate leaf kinds.
const beginnerAdvancedKinds = new Set(["function", "column", "module", "pipeline-step"]);
const beginnerIntermediateKinds = new Set([
  "table",
  "collection",
  "queue",
  "cron",
  "route",
  "page",
  "component",
  "hook",
  "job",
  "database",
  "schema",
]);
function beginnerColdOpenNodes(graph) {
  const hasProductFlow = graph.nodes.some(
    (node) => typeof node.metadata?.flowOrder === "number",
  );
  return graph.nodes.filter((node) => {
    if (node.kind === "product") return false;
    if (
      node.metadata?.relationOnly ||
      node.metadata?.joinTable ||
      node.metadata?.exampleChrome
    ) {
      return false;
    }
    const isOverviewHub = node.metadata?.overviewHub === true;
    if (beginnerAdvancedKinds.has(node.kind) && !isOverviewHub) return false;
    if (beginnerIntermediateKinds.has(node.kind)) return false;
    if (node.metadata?.collapsedInOverview === true) return false;
    if (hasProductFlow && typeof node.metadata?.flowOrder !== "number") {
      return false;
    }
    return true;
  });
}
const selfBeginner = beginnerColdOpenNodes(selfGraph);
const fixtureBeginner = beginnerColdOpenNodes(fixtureGraph);
const selfBeginnerLeak = selfBeginner.filter(
  (node) =>
    beginnerAdvancedKinds.has(node.kind) || beginnerIntermediateKinds.has(node.kind),
);
const fixtureBeginnerLeak = fixtureBeginner.filter(
  (node) =>
    beginnerAdvancedKinds.has(node.kind) || beginnerIntermediateKinds.has(node.kind),
);
const fixtureBeginnerHasFlow = fixtureBeginner.every(
  (node) => typeof node.metadata?.flowOrder === "number",
);
const selfBeginnerHasFlow = selfBeginner.every(
  (node) => typeof node.metadata?.flowOrder === "number",
);
if (selfBeginner.length < 6) {
  fail(
    `self-map Beginner cold open should keep Product Flow systems, found ${selfBeginner.length}`,
  );
} else if (selfBeginnerLeak.length > 0) {
  fail(
    `self-map Beginner leaked advanced/intermediate kinds: ${selfBeginnerLeak
      .map((node) => `${node.kind}:${node.label}`)
      .join(", ")}`,
  );
} else if (!selfBeginnerHasFlow) {
  fail("self-map Beginner cold open should be Product Flow–led (every node has flowOrder)");
} else if (fixtureBeginner.length < 4) {
  fail(
    `mini-stack Beginner cold open should keep Product Flow systems, found ${fixtureBeginner.length}`,
  );
} else if (fixtureBeginnerLeak.length > 0) {
  fail(
    `mini-stack Beginner leaked advanced/intermediate kinds: ${fixtureBeginnerLeak
      .map((node) => `${node.kind}:${node.label}`)
      .join(", ")}`,
  );
} else if (!fixtureBeginnerHasFlow) {
  fail(
    "mini-stack Beginner cold open should be Product Flow–led (every node has flowOrder)",
  );
} else if (
  fixtureBeginner.some((node) =>
    ["Order", "Payment", "fulfillment"].includes(String(node.label)),
  )
) {
  fail("mini-stack Beginner must not show Order/Payment tables or fulfillment queue");
} else {
  // Standing guarantee: self-map Beginner still reads as the product story.
  const selfBeginnerLabels = selfBeginner
    .slice()
    .sort(
      (a, b) =>
        (a.metadata?.flowOrder ?? 999) - (b.metadata?.flowOrder ?? 999) ||
        String(a.label).localeCompare(String(b.label)),
    )
    .map((node) => String(node.label));
  const requiredSelfStory = ["CLI", "Compile pipeline", "Extractors", "Viewer"];
  const missingSelfStory = requiredSelfStory.filter(
    (label) => !selfBeginnerLabels.includes(label),
  );
  if (missingSelfStory.length) {
    fail(
      `self-map Beginner cold-read missing product story labels: ${missingSelfStory.join(", ")} (got ${selfBeginnerLabels.join(" → ")})`,
    );
  } else {
    pass(
      `Beginner cold open calm: self-map ${selfBeginner.length} flow nodes (${selfBeginnerLabels.join(" → ")}), mini-stack ${fixtureBeginner.length} flow nodes (no intermediate/advanced leaks)`,
    );
  }
}

// Intermediate without focus must stay calm (no global hub/leaf dump).
const selfIntermediateNoFocus = beginnerColdOpenNodes(selfGraph);
const fixtureIntermediateNoFocus = beginnerColdOpenNodes(fixtureGraph);
if (
  fixtureIntermediateNoFocus.some((node) =>
    ["Order", "Payment", "fulfillment"].includes(String(node.label)),
  )
) {
  fail(
    "mini-stack Intermediate without focus must not globally uncollapse Order/Payment/fulfillment",
  );
} else if (selfIntermediateNoFocus.length !== selfBeginner.length) {
  fail(
    "self-map Intermediate without focus should match Beginner calm overview",
  );
} else {
  pass(
    "Intermediate without focus stays Product Flow–calm (no global uncollapse)",
  );
}

// Focus neighborhood floor: contains children + key story neighbors; no advanced dump.
const neighborhoodEdgeKinds = new Set([
  "uses",
  "renders",
  "exposes",
  "triggers",
  "configures",
  "reads",
  "flows-to",
  "publishes",
  "consumes",
  "migrates",
  "writes",
  "schedules",
  "routes-to",
]);
function focusNeighborhoodIds(graph, rootId) {
  const outgoing = new Map();
  const incoming = new Map();
  for (const edge of graph.edges) {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    outgoing.get(edge.source).push(edge);
    incoming.get(edge.target).push(edge);
  }
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const tree = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    for (const edge of outgoing.get(id) || []) {
      if (edge.kind === "contains" && !tree.has(edge.target)) {
        tree.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  const found = new Set(tree);
  for (const id of tree) {
    const node = byId.get(id);
    const isOverviewHub = node?.metadata?.overviewHub === true;
    if (
      id !== rootId &&
      node &&
      beginnerAdvancedKinds.has(node.kind) &&
      !isOverviewHub
    ) {
      continue;
    }
    for (const edge of outgoing.get(id) || []) {
      if (neighborhoodEdgeKinds.has(edge.kind)) found.add(edge.target);
    }
    for (const edge of incoming.get(id) || []) {
      if (neighborhoodEdgeKinds.has(edge.kind)) found.add(edge.source);
    }
  }
  return found;
}
function intermediateFocusNodes(graph, rootId) {
  const allowed = focusNeighborhoodIds(graph, rootId);
  return graph.nodes.filter((node) => {
    if (!allowed.has(node.id)) return false;
    if (node.kind === "product") return false;
    if (
      node.metadata?.relationOnly ||
      node.metadata?.joinTable ||
      node.metadata?.exampleChrome
    ) {
      return false;
    }
    // Surfaces only inside their owning capability focus (mirror viewer).
    if (
      node.metadata?.role === "detection-surface" ||
      node.metadata?.detectionSurface
    ) {
      if (node.parentId !== rootId && node.id !== rootId) return false;
    }
    const isOverviewHub = node.metadata?.overviewHub === true;
    if (beginnerAdvancedKinds.has(node.kind) && !isOverviewHub) return false;
    return true;
  });
}
const focusExtractorsSystem = selfGraph.nodes.find(
  (node) => node.kind === "system" && node.label === "Extractors",
);
const focusCheckoutApi = fixtureGraph.nodes.find(
  (node) => node.kind === "api" && /checkout/i.test(node.label),
);
const selfExtractorsFocus = focusExtractorsSystem
  ? intermediateFocusNodes(selfGraph, focusExtractorsSystem.id)
  : [];
const fixtureCheckoutFocus = focusCheckoutApi
  ? intermediateFocusNodes(fixtureGraph, focusCheckoutApi.id)
  : [];
const selfExtractorsFocusLabels = new Set(
  selfExtractorsFocus.map((node) => String(node.label)),
);
const fixtureCheckoutFocusLabels = new Set(
  fixtureCheckoutFocus.map((node) => String(node.label)),
);
const selfFocusAdvancedLeak = selfExtractorsFocus.filter(
  (node) =>
    beginnerAdvancedKinds.has(node.kind) && !node.metadata?.overviewHub,
);
const fixtureFocusAdvancedLeak = fixtureCheckoutFocus.filter(
  (node) =>
    beginnerAdvancedKinds.has(node.kind) && !node.metadata?.overviewHub,
);
if (!focusExtractorsSystem) {
  fail("self-map should have Extractors system for Intermediate focus floor");
} else if (!focusCheckoutApi) {
  fail("mini-stack should have Checkout API for Intermediate focus floor");
} else if (selfExtractorsFocus.length < 8) {
  fail(
    `Extractors Intermediate neighborhood too small: ${selfExtractorsFocus.length}`,
  );
} else if (
  !selfExtractorsFocusLabels.has("typescript") ||
  !selfExtractorsFocusLabels.has("prisma")
) {
  fail("Extractors Intermediate neighborhood should include extractor capabilities");
} else if (
  !selfExtractorsFocusLabels.has("Compile pipeline") &&
  !selfExtractorsFocusLabels.has("Schema contract") &&
  !selfExtractorsFocusLabels.has("Graph assembly")
) {
  fail(
    "Extractors Intermediate neighborhood should include key collab neighbors",
  );
} else if (selfFocusAdvancedLeak.length > 0) {
  fail(
    `Extractors Intermediate focus leaked advanced kinds: ${selfFocusAdvancedLeak
      .map((node) => `${node.kind}:${node.label}`)
      .join(", ")}`,
  );
} else if (selfExtractorsFocus.length > 40) {
  fail(
    `Extractors Intermediate neighborhood too large (global dump?): ${selfExtractorsFocus.length}`,
  );
} else if (
  !fixtureCheckoutFocusLabels.has("POST /checkout") ||
  !fixtureCheckoutFocusLabels.has("GET /health")
) {
  fail("Checkout API Intermediate neighborhood should include its routes");
} else if (
  !fixtureCheckoutFocusLabels.has("Catalog data") &&
  !fixtureCheckoutFocusLabels.has("fulfillment") &&
  !fixtureCheckoutFocusLabels.has("Order pipeline")
) {
  fail(
    "Checkout API Intermediate neighborhood should include key collab/story neighbors",
  );
} else if (fixtureFocusAdvancedLeak.length > 0) {
  fail(
    `Checkout API Intermediate focus leaked advanced kinds: ${fixtureFocusAdvancedLeak
      .map((node) => `${node.kind}:${node.label}`)
      .join(", ")}`,
  );
} else if (
  fixtureCheckoutFocus.some((node) => node.label === "Order" || node.label === "Payment")
) {
  fail(
    "Checkout API Intermediate neighborhood should not pull Catalog tables until Catalog is focused",
  );
} else {
  pass(
    `Intermediate focus neighborhoods: Extractors ${selfExtractorsFocus.length} nodes, Checkout API ${fixtureCheckoutFocus.length} nodes (children + collab, no advanced dump)`,
  );
}

// Search → cluster floor: jump targets are walkable roots, not a god-graph filter.
const searchFunctionFocusKinds = new Set([
  "module",
  "api",
  "service",
  "function",
  "route",
  "ui",
  "page",
  "component",
  "hook",
]);
const searchAdvancedKinds = new Set(["function", "column", "module", "pipeline-step"]);
const searchIntermediateKinds = new Set([
  "table",
  "collection",
  "queue",
  "cron",
  "route",
  "page",
  "component",
  "hook",
  "job",
  "database",
  "schema",
]);
function clusterRootForGraph(graph, id) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map();
  for (const edge of graph.edges) {
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target).push(edge);
  }
  const parentOf = (node) => {
    if (!node) return null;
    if (node.parentId && byId.has(node.parentId)) return byId.get(node.parentId);
    const owned = (incoming.get(node.id) || []).find((edge) => edge.kind === "contains");
    return owned ? byId.get(owned.source) || null : null;
  };
  const node = byId.get(id);
  if (!node || node.kind === "product") return null;
  if (
    node.kind === "system" ||
    node.kind === "pipeline" ||
    node.kind === "api" ||
    node.kind === "service" ||
    node.kind === "ui" ||
    node.kind === "module"
  ) {
    return node.id;
  }
  if (searchAdvancedKinds.has(node.kind)) {
    let cur = node;
    while (cur) {
      const parent = parentOf(cur);
      if (!parent) break;
      if (searchFunctionFocusKinds.has(parent.kind)) return parent.id;
      cur = parent;
    }
  }
  if (
    searchIntermediateKinds.has(node.kind) ||
    node.kind === "external" ||
    node.kind === "config"
  ) {
    let cur = node;
    while (cur) {
      const parent = parentOf(cur);
      if (!parent) break;
      if (
        parent.kind === "system" ||
        parent.kind === "pipeline" ||
        parent.kind === "api" ||
        parent.kind === "service" ||
        parent.kind === "ui"
      ) {
        return parent.id;
      }
      cur = parent;
    }
  }
  let cur = node;
  while (cur) {
    if (
      cur.kind === "system" ||
      cur.kind === "pipeline" ||
      cur.kind === "api" ||
      cur.kind === "service" ||
      cur.kind === "ui" ||
      cur.kind === "module"
    ) {
      return cur.id;
    }
    cur = parentOf(cur);
  }
  return node.id;
}
const fixtureCreateCheckout = fixtureGraph.nodes.find(
  (node) => node.kind === "function" && node.label === "createCheckout",
);
const fixtureOrderTable = fixtureGraph.nodes.find(
  (node) => node.kind === "table" && node.label === "Order",
);
const createCheckoutCluster = fixtureCreateCheckout
  ? fixtureGraph.nodes.find(
      (node) => node.id === clusterRootForGraph(fixtureGraph, fixtureCreateCheckout.id),
    )
  : null;
const orderCluster = fixtureOrderTable
  ? fixtureGraph.nodes.find(
      (node) => node.id === clusterRootForGraph(fixtureGraph, fixtureOrderTable.id),
    )
  : null;
const selfExtractorsClusterId = focusExtractorsSystem
  ? clusterRootForGraph(selfGraph, focusExtractorsSystem.id)
  : null;
if (!fixtureCreateCheckout || !createCheckoutCluster) {
  fail("search cluster floor needs createCheckout → module/api root");
} else if (
  createCheckoutCluster.kind !== "module" ||
  createCheckoutCluster.label !== "src/server.ts"
) {
  fail(
    `createCheckout search should enter src/server.ts module cluster, got ${createCheckoutCluster.kind}:${createCheckoutCluster.label}`,
  );
} else if (!fixtureOrderTable || !orderCluster) {
  fail("search cluster floor needs Order table → Catalog data system");
} else if (orderCluster.kind !== "system" || orderCluster.label !== "Catalog data") {
  fail(
    `Order search should enter Catalog data system, got ${orderCluster.kind}:${orderCluster.label}`,
  );
} else if (!focusExtractorsSystem || selfExtractorsClusterId !== focusExtractorsSystem.id) {
  fail("Extractors search should focus the Extractors system itself");
} else {
  pass(
    "Search enters cluster: createCheckout→src/server.ts, Order→Catalog data, Extractors→self",
  );
}

// Intermediate edge calm: ownership contains fans exist in IR but stay off-canvas.
const extractorsContainsFan = focusExtractorsSystem
  ? selfGraph.edges.filter(
      (edge) =>
        edge.kind === "contains" &&
        edge.source === focusExtractorsSystem.id &&
        selfExtractorsFocus.some((node) => node.id === edge.target),
    )
  : [];
const extractorsDerivedDepends = focusExtractorsSystem
  ? selfGraph.edges.filter((edge) => {
      if (edge.kind !== "depends-on") return false;
      const ids = new Set(selfExtractorsFocus.map((node) => node.id));
      if (!ids.has(edge.source) || !ids.has(edge.target)) return false;
      return (edge.evidence || []).some((item) => item.certainty === "derived");
    })
  : [];
if (extractorsContainsFan.length < 8) {
  fail(
    `Extractors Intermediate should own a contains fan in IR (≥8 child edges), found ${extractorsContainsFan.length}`,
  );
} else if (
  !viewerHtml.includes("ownershipEdgeKinds.has(edge.kind)") ||
  !viewerHtml.includes("showsStructuralEdge(edge)")
) {
  fail(
    "viewer must collapse ownership contains fans via ownershipEdgeKinds / showsStructuralEdge",
  );
} else if (
  extractorsDerivedDepends.length > 0 &&
  !viewerHtml.includes("structuralHairlineKinds")
) {
  fail(
    "viewer must gate derived depends-on hairlines via structuralHairlineKinds",
  );
} else {
  pass(
    `Intermediate edge calm floor: Extractors ${extractorsContainsFan.length} contains fans collapsed off-canvas; ${extractorsDerivedDepends.length} derived depends-on hairlines selection/Advanced-gated`,
  );
}

// Advanced-in-focus floor: modules (and api functions) inside the cluster only.
const broadFocusKinds = new Set(["system", "pipeline"]);
const functionFocusKinds = new Set([
  "module",
  "api",
  "service",
  "function",
  "route",
  "ui",
  "page",
  "component",
  "hook",
]);
function advancedFocusNodes(graph, rootId) {
  const allowed = focusNeighborhoodIds(graph, rootId);
  const focused = graph.nodes.find((node) => node.id === rootId);
  return graph.nodes.filter((node) => {
    if (!allowed.has(node.id)) return false;
    if (node.kind === "product") return false;
    if (
      node.metadata?.relationOnly ||
      node.metadata?.joinTable ||
      node.metadata?.exampleChrome
    ) {
      return false;
    }
    const isOverviewHub = node.metadata?.overviewHub === true;
    if (beginnerAdvancedKinds.has(node.kind) && !isOverviewHub) {
      // Mirror viewer showsAdvancedKind: modules/columns at Advanced+focus;
      // functions only inside a code-container focus (not broad system/pipeline).
      if (node.kind === "function") {
        if (!focused) return false;
        if (broadFocusKinds.has(focused.kind)) return false;
        return functionFocusKinds.has(focused.kind);
      }
      return true;
    }
    return true;
  });
}
const selfExtractorsAdvanced = focusExtractorsSystem
  ? advancedFocusNodes(selfGraph, focusExtractorsSystem.id)
  : [];
const fixtureCheckoutAdvanced = focusCheckoutApi
  ? advancedFocusNodes(fixtureGraph, focusCheckoutApi.id)
  : [];
const selfExtractorsAdvancedModules = selfExtractorsAdvanced.filter(
  (node) => node.kind === "module",
);
const selfExtractorsAdvancedFunctions = selfExtractorsAdvanced.filter(
  (node) => node.kind === "function",
);
const fixtureCheckoutAdvancedFunctions = fixtureCheckoutAdvanced.filter(
  (node) => node.kind === "function",
);
const selfAdvancedLeakedModules = selfExtractorsAdvanced.filter(
  (node) =>
    node.kind === "module" &&
    ["src/viewer.ts", "src/cli.ts", "src/compile.ts"].includes(String(node.label)),
);
const typescriptModule = selfGraph.nodes.find(
  (node) => node.kind === "module" && node.label === "src/extractors/typescript.ts",
);
const selfTypescriptModuleAdvanced = typescriptModule
  ? advancedFocusNodes(selfGraph, typescriptModule.id)
  : [];
const selfTypescriptModuleFunctions = selfTypescriptModuleAdvanced.filter(
  (node) => node.kind === "function",
);
if (!focusExtractorsSystem || !focusCheckoutApi) {
  fail("Advanced-in-focus floors need Extractors + Checkout API roots");
} else if (selfExtractorsAdvancedModules.length < 8) {
  fail(
    `Extractors Advanced-in-focus should reveal extractor modules, found ${selfExtractorsAdvancedModules.length}`,
  );
} else if (selfExtractorsAdvancedFunctions.length > 0) {
  fail(
    `Extractors (system) Advanced should show modules first, not ${selfExtractorsAdvancedFunctions.length} functions`,
  );
} else if (selfAdvancedLeakedModules.length > 0) {
  fail(
    `Extractors Advanced leaked modules outside cluster: ${selfAdvancedLeakedModules
      .map((node) => node.label)
      .join(", ")}`,
  );
} else if (selfExtractorsAdvanced.length > 80) {
  fail(
    `Extractors Advanced-in-focus too large (global dump?): ${selfExtractorsAdvanced.length}`,
  );
} else if (
  !fixtureCheckoutAdvanced.some((node) => node.label === "src/server.ts") ||
  !fixtureCheckoutAdvancedFunctions.some((node) => node.label === "createCheckout")
) {
  fail(
    "Checkout API Advanced-in-focus should include server module + createCheckout function",
  );
} else if (fixtureCheckoutAdvancedFunctions.length < 2) {
  fail(
    `Checkout API Advanced-in-focus should keep local functions, found ${fixtureCheckoutAdvancedFunctions.length}`,
  );
} else if (
  fixtureCheckoutAdvancedFunctions.length >=
  fixtureGraph.nodes.filter((node) => node.kind === "function").length
) {
  fail("Checkout API Advanced must not equal whole-repo function dump");
} else if (!typescriptModule) {
  fail("self-map should have src/extractors/typescript.ts module for nested Advanced floor");
} else if (selfTypescriptModuleFunctions.length < 5) {
  fail(
    `Module Advanced-in-focus should reveal functions, found ${selfTypescriptModuleFunctions.length}`,
  );
} else if (
  selfTypescriptModuleAdvanced.some(
    (node) => node.kind === "module" && node.label === "src/viewer.ts",
  )
) {
  fail("typescript module Advanced must not pull unrelated modules like viewer.ts");
} else {
  pass(
    `Advanced-in-focus: Extractors ${selfExtractorsAdvancedModules.length} modules (no function dump), Checkout ${fixtureCheckoutAdvancedFunctions.length} functions, typescript module ${selfTypescriptModuleFunctions.length} functions`,
  );
}

// Walkable bugfix: dead-end Intermediate leaves escalate to parent Advanced.
// Extractor services do not contain modules (siblings under Extractors) — double-click
// must not strand the user on a 1-node neighborhood.
if (
  !viewerHtml.includes("function resolveWalkFocus(clickedId)") ||
  !viewerHtml.includes("function intermediateNeighborhoodNodes(rootId)") ||
  !viewerHtml.includes("function advancedNeighborhoodNodes(rootId)") ||
  !viewerHtml.includes("const walk = resolveWalkFocus(id)")
) {
  fail(
    "viewer must resolveWalkFocus so Intermediate dead-end leaves escalate to parent Advanced",
  );
} else if (!viewerHtml.includes("View deepens inside a focus")) {
  fail(
    "viewer View button must refuse Intermediate/Advanced without a focus (no fake calm cycle)",
  );
} else if (
  !viewerHtml.includes('state.tier = state.tier === "advanced" ? "intermediate" : "advanced"')
) {
  fail(
    "viewer tier click with focus must toggle Intermediate↔Advanced only (Beginner via Overview/Back)",
  );
} else if (
  !viewerHtml.includes("Without a focus, Intermediate/Advanced are not real modes")
) {
  fail(
    "viewer restoreWalkState must coerce Intermediate/Advanced-without-focus back to Beginner",
  );
}

function resolveWalkFocusForGraph(graph, clickedId) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map();
  const incoming = new Map();
  for (const edge of graph.edges) {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    outgoing.get(edge.source).push(edge);
    incoming.get(edge.target).push(edge);
  }
  const parentOf = (node) => {
    if (!node) return null;
    if (node.parentId && byId.has(node.parentId)) return byId.get(node.parentId);
    const owned = (incoming.get(node.id) || []).find((edge) => edge.kind === "contains");
    return owned ? byId.get(owned.source) || null : null;
  };
  const inter = (rootId) => intermediateFocusNodes(graph, rootId);
  const adv = (rootId) => advancedFocusNodes(graph, rootId);
  const clicked = byId.get(clickedId);
  if (!clicked) {
    return { focusId: clickedId, tier: "intermediate", selectedId: clickedId };
  }
  if (beginnerAdvancedKinds.has(clicked.kind)) {
    return { focusId: clickedId, tier: "advanced", selectedId: clickedId };
  }
  const interNodes = inter(clickedId);
  const interOthers = interNodes.filter((node) => node.id !== clickedId);
  if (interOthers.length >= 2) {
    return { focusId: clickedId, tier: "intermediate", selectedId: clickedId };
  }
  let walkParent = parentOf(clicked);
  while (
    walkParent &&
    walkParent.kind !== "system" &&
    walkParent.kind !== "pipeline" &&
    walkParent.kind !== "api" &&
    walkParent.kind !== "ui"
  ) {
    walkParent = parentOf(walkParent);
  }
  if (walkParent) {
    const parentAdv = adv(walkParent.id);
    const modules = parentAdv.filter((node) => node.kind === "module");
    if (modules.length >= 1) {
      return { focusId: walkParent.id, tier: "advanced", selectedId: clickedId };
    }
    const parentInter = inter(walkParent.id);
    if (parentInter.length > interNodes.length) {
      return { focusId: walkParent.id, tier: "intermediate", selectedId: clickedId };
    }
  }
  const selfAdv = adv(clickedId);
  if (selfAdv.length > interNodes.length) {
    return { focusId: clickedId, tier: "advanced", selectedId: clickedId };
  }
  let advancedContains = 0;
  const allowedTree = focusNeighborhoodIds(graph, clickedId);
  for (const id of allowedTree) {
    if (id === clickedId) continue;
    const node = byId.get(id);
    if (
      node &&
      beginnerAdvancedKinds.has(node.kind) &&
      !node.metadata?.overviewHub
    ) {
      // Only count contains-descendants, not story neighbors — approximate via parent walk.
      let cur = node;
      let under = false;
      while (cur) {
        const p = parentOf(cur);
        if (!p) break;
        if (p.id === clickedId) {
          under = true;
          break;
        }
        cur = p;
      }
      if (under) advancedContains += 1;
    }
  }
  if (
    (clicked.kind === "system" || clicked.kind === "pipeline") &&
    advancedContains >= 2
  ) {
    return { focusId: clickedId, tier: "advanced", selectedId: clickedId };
  }
  return { focusId: clickedId, tier: "intermediate", selectedId: clickedId };
}

// Capability Attempt: extractor capabilities expose deterministic detection surfaces.
const selfTypescriptCapability = selfGraph.nodes.find(
  (node) => node.kind === "capability" && node.label === "typescript",
);
const selfKubernetesCapability = selfGraph.nodes.find(
  (node) => node.kind === "capability" && node.label === "kubernetes",
);
const typescriptCapabilitySurfaces = selfTypescriptCapability
  ? selfGraph.nodes.filter(
      (node) =>
        node.parentId === selfTypescriptCapability.id &&
        node.metadata?.role === "detection-surface",
    )
  : [];
const kubernetesCapabilitySurfaces = selfKubernetesCapability
  ? selfGraph.nodes.filter(
      (node) =>
        node.parentId === selfKubernetesCapability.id &&
        node.metadata?.role === "detection-surface",
    )
  : [];
const typescriptCapabilityWalk = selfTypescriptCapability
  ? resolveWalkFocusForGraph(selfGraph, selfTypescriptCapability.id)
  : null;
const typescriptFocusSurfaces = selfTypescriptCapability
  ? intermediateFocusNodes(selfGraph, selfTypescriptCapability.id).filter(
      (node) => node.metadata?.role === "detection-surface",
    )
  : [];
const extractorsDirectWalk = focusExtractorsSystem
  ? resolveWalkFocusForGraph(selfGraph, focusExtractorsSystem.id)
  : null;
const typescriptModuleWalk = typescriptModule
  ? resolveWalkFocusForGraph(selfGraph, typescriptModule.id)
  : null;
const capabilityCount = selfGraph.nodes.filter(
  (node) => node.kind === "capability",
).length;
const detectionSurfaceCount = selfGraph.nodes.filter(
  (node) => node.metadata?.role === "detection-surface",
).length;

if (!viewerHtml.includes('name: "Detects"') || !viewerHtml.includes("isDetectionSurface")) {
  fail("viewer must expose a Detects lane for capability detection surfaces");
} else if (!selfTypescriptCapability || !selfKubernetesCapability) {
  fail("self-map should project typescript and kubernetes extractor capabilities");
} else if (typescriptCapabilitySurfaces.length < 4) {
  fail(
    `typescript capability should own detection surfaces, found ${typescriptCapabilitySurfaces.length}`,
  );
} else if (
  !typescriptCapabilitySurfaces.some((node) => node.label === "HTTP routes") ||
  !typescriptCapabilitySurfaces.some((node) => node.label === "Modules")
) {
  fail(
    `typescript detection surfaces missing Modules/HTTP routes: ${typescriptCapabilitySurfaces.map((n) => n.label).join(", ")}`,
  );
} else if (kubernetesCapabilitySurfaces.length < 3) {
  fail(
    `kubernetes capability should own detection surfaces, found ${kubernetesCapabilitySurfaces.length}`,
  );
} else if (
  !kubernetesCapabilitySurfaces.some((node) => node.label === "Deployment") ||
  !kubernetesCapabilitySurfaces.some((node) => node.label === "Service") ||
  !kubernetesCapabilitySurfaces.some((node) => node.label === "Ingress")
) {
  fail(
    `kubernetes detection surfaces missing Deployment/Service/Ingress: ${kubernetesCapabilitySurfaces.map((n) => n.label).join(", ")}`,
  );
} else if (
  !typescriptCapabilityWalk ||
  typescriptCapabilityWalk.focusId !== selfTypescriptCapability.id ||
  typescriptCapabilityWalk.tier !== "intermediate"
) {
  fail(
    `typescript capability should open Intermediate (detection room), got focus=${typescriptCapabilityWalk?.focusId} tier=${typescriptCapabilityWalk?.tier}`,
  );
} else if (typescriptFocusSurfaces.length < 4) {
  fail(
    `typescript Intermediate focus should show detection surfaces, found ${typescriptFocusSurfaces.length}`,
  );
} else if (
  !extractorsDirectWalk ||
  extractorsDirectWalk.focusId !== focusExtractorsSystem.id ||
  extractorsDirectWalk.tier !== "intermediate"
) {
  fail(
    `Extractors system double-click should stay Intermediate (capability roster), got focus=${extractorsDirectWalk?.focusId} tier=${extractorsDirectWalk?.tier}`,
  );
} else if (
  !typescriptModuleWalk ||
  typescriptModuleWalk.focusId !== typescriptModule.id ||
  typescriptModuleWalk.tier !== "advanced"
) {
  fail(
    "typescript module double-click must stay on the module at Advanced (not escalate to Extractors)",
  );
} else if (capabilityCount < 10 || detectionSurfaceCount < 30) {
  fail(
    `expected capability roster + surfaces on self-map, got capabilities=${capabilityCount} surfaces=${detectionSurfaceCount}`,
  );
} else {
  pass(
    `Capability Attempt: ${capabilityCount} capabilities, ${detectionSurfaceCount} detection surfaces; typescript Intermediate shows ${typescriptFocusSurfaces.length} surfaces; kubernetes has Deployment/Service/Ingress`,
  );
}


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

// ---------------------------------------------------------------------------
// Capability ladder rung 7 prep: Docker/Compose extractor + mini-docker smoke.
// ---------------------------------------------------------------------------
const miniDockerGraph = await compileRepository(miniDockerRoot);
const miniDockerServices = miniDockerGraph.nodes.filter(
  (node) => node.kind === "service" && node.metadata?.docker === true,
);
const miniDockerServiceLabels = miniDockerServices.map((node) => node.label);
console.log(
  `Mini-docker graph: ${miniDockerGraph.nodes.length} nodes, ${miniDockerGraph.edges.length} edges → services ${[...new Set(miniDockerServiceLabels)].sort().join(", ")}`,
);

const miniDockerProduct = miniDockerGraph.nodes.find(
  (node) => node.kind === "product",
);
if (!miniDockerProduct || miniDockerProduct.label !== "Mini Docker notes") {
  fail(
    `mini-docker product label expected 'Mini Docker notes', found '${miniDockerProduct?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-docker product labeled Mini Docker notes");
}

const miniDockerExtractors = miniDockerGraph.extractors.map((item) => item.id);
if (!miniDockerExtractors.includes("docker")) {
  fail(
    `mini-docker graph.extractors missing docker; found ${JSON.stringify(miniDockerExtractors)}`,
  );
} else {
  pass("mini-docker registers docker extractor");
}

const miniDockerComposeServices = miniDockerServices.filter(
  (node) => node.metadata?.dockerService === true,
);
const miniDockerServiceNames = new Set(
  miniDockerComposeServices.map((node) => node.metadata?.serviceName),
);
for (const expected of ["api", "web", "db"]) {
  if (!miniDockerServiceNames.has(expected)) {
    fail(
      `mini-docker missing compose service ${expected}; found ${[...miniDockerServiceNames].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-docker has compose service ${expected}`);
  }
}

// Overlay twin lock: docker-compose.yml + docker-compose.images.yml → one node each.
if (miniDockerComposeServices.length !== 3) {
  fail(
    `mini-docker expected exactly 3 compose services after overlay dedupe, found ${miniDockerComposeServices.length} (${miniDockerComposeServices.map((node) => node.label).join(", ")})`,
  );
} else {
  pass("mini-docker overlay twins deduped to 3 compose services");
}

for (const expected of ["API · 3000", "Web · 8080", "DB"]) {
  if (!miniDockerServiceLabels.includes(expected)) {
    fail(
      `mini-docker missing humanized service label ${expected}; found ${miniDockerServiceLabels.join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-docker service label ${expected}`);
  }
}

// Compose `build: .` owns the root Dockerfile — quiet twin "App image" chrome.
if (miniDockerServiceLabels.includes("App image")) {
  fail(
    `mini-docker should quiet Dockerfile App image when Compose build owns it; found ${miniDockerServiceLabels.join(", ")}`,
  );
} else {
  pass("mini-docker quiets Dockerfile App image owned by Compose build");
}

const miniDockerApi = miniDockerComposeServices.find(
  (node) => node.metadata?.serviceName === "api",
);
const miniDockerWeb = miniDockerComposeServices.find(
  (node) => node.metadata?.serviceName === "web",
);
const miniDockerDb = miniDockerComposeServices.find(
  (node) => node.metadata?.serviceName === "db",
);
if (
  !Array.isArray(miniDockerApi?.metadata?.hostPorts) ||
  !miniDockerApi.metadata.hostPorts.includes("3000")
) {
  fail(
    `mini-docker api hostPorts expected ["3000"], found ${JSON.stringify(miniDockerApi?.metadata?.hostPorts)}`,
  );
} else {
  pass("mini-docker api publishes port 3000");
}
if (
  !Array.isArray(miniDockerWeb?.metadata?.hostPorts) ||
  !miniDockerWeb.metadata.hostPorts.includes("8080")
) {
  fail(
    `mini-docker web hostPorts expected ["8080"], found ${JSON.stringify(miniDockerWeb?.metadata?.hostPorts)}`,
  );
} else {
  pass("mini-docker web publishes port 8080");
}
// Primary has build: . ; images overlay adds notes-api:latest — prefer build+image.
if (miniDockerApi?.metadata?.build !== ".") {
  fail(
    `mini-docker api build expected '.', found ${miniDockerApi?.metadata?.build ?? "(missing)"}`,
  );
} else {
  pass("mini-docker api keeps build . from primary compose");
}
if (miniDockerApi?.metadata?.image !== "notes-api:latest") {
  fail(
    `mini-docker api image expected notes-api:latest from overlay, found ${miniDockerApi?.metadata?.image ?? "(missing)"}`,
  );
} else {
  pass("mini-docker api merges overlay image notes-api:latest");
}
if (
  !Array.isArray(miniDockerApi?.metadata?.composeFiles) ||
  !miniDockerApi.metadata.composeFiles.some((file) =>
    /docker-compose\.yml$/i.test(String(file)),
  ) ||
  !miniDockerApi.metadata.composeFiles.some((file) =>
    /docker-compose\.images\.yml$/i.test(String(file)),
  )
) {
  fail(
    `mini-docker api composeFiles should cite primary + images overlay, found ${JSON.stringify(miniDockerApi?.metadata?.composeFiles)}`,
  );
} else {
  pass("mini-docker api composeFiles cite primary + images overlay");
}
if (miniDockerWeb?.metadata?.image !== "nginx:alpine") {
  fail(
    `mini-docker web image expected nginx:alpine, found ${miniDockerWeb?.metadata?.image ?? "(missing)"}`,
  );
} else {
  pass("mini-docker web image label nginx:alpine");
}
if (miniDockerDb?.metadata?.image !== "postgres:16") {
  fail(
    `mini-docker db image expected postgres:16, found ${miniDockerDb?.metadata?.image ?? "(missing)"}`,
  );
} else {
  pass("mini-docker db image label postgres:16");
}

const miniDockerNeedsEdges = miniDockerGraph.edges.filter(
  (edge) =>
    edge.kind === "depends-on" &&
    edge.label === "needs" &&
    miniDockerServices.some((node) => node.id === edge.source) &&
    miniDockerServices.some((node) => node.id === edge.target),
);
const miniDockerNeedsPairs = new Set(
  miniDockerNeedsEdges.map((edge) => {
    const from = miniDockerServices.find((node) => node.id === edge.source);
    const to = miniDockerServices.find((node) => node.id === edge.target);
    return `${from?.metadata?.serviceName}→${to?.metadata?.serviceName}`;
  }),
);
for (const expected of ["api→db", "web→api"]) {
  if (!miniDockerNeedsPairs.has(expected)) {
    fail(
      `mini-docker missing depends_on edge ${expected}; found ${[...miniDockerNeedsPairs].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-docker depends_on ${expected}`);
  }
}

const miniDockerEvidenceGaps = miniDockerServices.filter((node) => {
  const detail = node.evidence?.[0]?.detail ?? "";
  if (node.metadata?.dockerService === true) {
    const name = node.metadata?.serviceName;
    return typeof name !== "string" || !detail.includes(`service:${name}`);
  }
  if (node.metadata?.dockerfileService === true) {
    return !detail.includes("dockerfile");
  }
  return true;
});
if (miniDockerEvidenceGaps.length > 0) {
  fail(
    `mini-docker evidence should cite service:/dockerfile: ${miniDockerEvidenceGaps
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-docker evidence details cite service/dockerfile");
}

const miniDockerSemantic = miniDockerGraph.nodes.filter(
  (node) => node.metadata?.projection === "semantic",
);
const miniDockerByKey = new Map(
  miniDockerSemantic
    .filter((node) => typeof node.metadata?.systemKey === "string")
    .map((node) => [node.metadata.systemKey, node]),
);
const miniDockerDeploy = miniDockerByKey.get("deploy");
if (!miniDockerDeploy || miniDockerDeploy.label !== "Containers") {
  fail(
    `mini-docker Deploy label expected 'Containers' from README, found '${miniDockerDeploy?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-docker Deploy labeled Containers");
}

const nestedDockerServices = miniDockerServices.filter(
  (node) => node.parentId === miniDockerDeploy?.id,
);
if (nestedDockerServices.length < 3) {
  fail(
    `mini-docker expected ≥3 compose services nested under Containers, found ${nestedDockerServices.length}`,
  );
} else {
  pass(
    `mini-docker ${nestedDockerServices.length} services nested under Containers`,
  );
}

const dockerOverviewLeaves = nestedDockerServices.filter(
  (node) => node.metadata?.collapsedInOverview !== true,
);
if (dockerOverviewLeaves.length > 0) {
  fail(
    `mini-docker overview should collapse services under Containers, still visible: ${dockerOverviewLeaves
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-docker overview collapses services under Containers");
}

const miniDockerFlow = miniDockerSemantic
  .filter((node) => typeof node.metadata?.flowOrder === "number")
  .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
if (
  miniDockerFlow.length < 1 ||
  miniDockerFlow[0]?.metadata?.systemKey !== "deploy"
) {
  fail(
    `mini-docker flowOrder expected Containers/Deploy, got ${miniDockerFlow.map((node) => node.label).join(" → ") || "(none)"}`,
  );
} else {
  pass(
    `mini-docker flowOrder: ${miniDockerFlow.map((node) => node.label).join(" → ")}`,
  );
}

const miniDockerModules = miniDockerGraph.nodes.filter(
  (node) => node.kind === "module" && node.metadata?.dockerModule === true,
);
const miniDockerModuleLabels = new Set(
  miniDockerModules.map((node) =>
    String(node.metadata?.file ?? node.label).replaceAll("\\", "/"),
  ),
);
if (![...miniDockerModuleLabels].some((label) => label.endsWith("docker-compose.yml"))) {
  fail("mini-docker missing docker-compose.yml module");
} else {
  pass("mini-docker has docker-compose.yml module");
}
if (![...miniDockerModuleLabels].some((label) => /(^|\/)Dockerfile$/.test(label))) {
  fail("mini-docker missing Dockerfile module");
} else {
  pass("mini-docker has Dockerfile module");
}

const dockerModuleChrome = miniDockerModules.filter(
  (node) => node.metadata?.collapsedInOverview !== true,
);
if (dockerModuleChrome.length > 0) {
  fail(
    `mini-docker overview should collapse Docker modules, still visible: ${dockerModuleChrome
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-docker overview collapses Docker modules");
}

const dockerCommerceNoise = miniDockerGraph.edges.some((edge) =>
  /checkout|orders?/i.test(
    `${edge.label ?? ""} ${JSON.stringify(edge.metadata ?? {})}`,
  ),
);
if (dockerCommerceNoise) {
  fail(
    "mini-docker should not inherit Checkout/orders commerce collaboration copy",
  );
} else {
  pass("mini-docker has no Checkout/orders commerce collaboration noise");
}

// ---------------------------------------------------------------------------
// Capability ladder rung 7: real Docker/Compose repo (pinned SHA, gitignored).
// Golden-lock dockersamples/example-voting-app services under Deploy.
// ---------------------------------------------------------------------------
let dockerRealRoot;
try {
  dockerRealRoot = await ensureRealRepo(EXAMPLE_VOTING_APP);
  pass(
    `docker real repo ${EXAMPLE_VOTING_APP.name} ready @ ${EXAMPLE_VOTING_APP.sha.slice(0, 12)}`,
  );
} catch (error) {
  fail(
    `could not ensure docker real repo ${EXAMPLE_VOTING_APP.name}@${EXAMPLE_VOTING_APP.sha}: ${error instanceof Error ? error.message : error}`,
  );
}

if (dockerRealRoot) {
  let dockerRealGraph;
  try {
    dockerRealGraph = await compileRepository(dockerRealRoot);
    pass(
      `docker-real-repo scan completed: ${dockerRealGraph.nodes.length} nodes, ${dockerRealGraph.edges.length} edges`,
    );
  } catch (error) {
    fail(
      `docker-real-repo scan crashed on ${EXAMPLE_VOTING_APP.name}: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (dockerRealGraph) {
    const dockerRealServices = dockerRealGraph.nodes.filter(
      (node) => node.kind === "service" && node.metadata?.dockerService === true,
    );
    const dockerRealSemantic = dockerRealGraph.nodes.filter(
      (node) => node.metadata?.projection === "semantic",
    );
    const dockerRealProduct = dockerRealGraph.nodes.find(
      (node) => node.kind === "product",
    );
    const dockerRealByKey = new Map(
      dockerRealSemantic
        .filter((node) => typeof node.metadata?.systemKey === "string")
        .map((node) => [node.metadata.systemKey, node]),
    );
    const dockerRealDeploy = dockerRealByKey.get("deploy");
    const dockerRealServiceNames = new Set(
      dockerRealServices.map((node) => node.metadata?.serviceName),
    );
    const dockerRealServiceLabels = new Set(
      dockerRealServices.map((node) => node.label),
    );

    const dockerRealSummary = {
      pin: `${EXAMPLE_VOTING_APP.name}@${EXAMPLE_VOTING_APP.sha}`,
      product: dockerRealProduct?.label ?? null,
      nodes: dockerRealGraph.nodes.length,
      edges: dockerRealGraph.edges.length,
      services: dockerRealServiceNames.size,
      semantic: dockerRealSemantic.map((node) => node.label),
    };
    console.log(
      `Docker-real-repo scan summary: ${JSON.stringify(dockerRealSummary)}`,
    );

    if (
      !dockerRealProduct ||
      dockerRealProduct.label !== "Example Voting App"
    ) {
      fail(
        `docker-real-repo product label expected 'Example Voting App', found '${dockerRealProduct?.label ?? "(missing)"}'`,
      );
    } else {
      pass(`docker-real-repo product label: ${dockerRealProduct.label}`);
    }

    if (!dockerRealDeploy || dockerRealDeploy.label !== "Deploy") {
      fail(
        `docker-real-repo deploy system label expected 'Deploy', found '${dockerRealDeploy?.label ?? "(missing)"}'`,
      );
    } else {
      pass("docker-real-repo deploy system labeled 'Deploy'");
    }

    if (!dockerRealGraph.extractors.some((item) => item.id === "docker")) {
      fail("docker-real-repo graph.extractors missing docker");
    } else {
      pass("docker-real-repo registers docker extractor");
    }

    if (dockerRealServiceNames.size < 6) {
      fail(
        `docker-real-repo expected ≥6 unique compose services, found ${dockerRealServiceNames.size}`,
      );
    } else {
      pass(
        `docker-real-repo ${dockerRealServiceNames.size} unique compose services`,
      );
    }

    for (const expected of [
      "vote",
      "result",
      "worker",
      "redis",
      "db",
      "seed",
    ]) {
      if (!dockerRealServiceNames.has(expected)) {
        fail(
          `docker-real-repo missing compose service ${expected}; found ${[...dockerRealServiceNames].sort().join(", ") || "(none)"}`,
        );
      } else {
        pass(`docker-real-repo has compose service ${expected}`);
      }
    }

    for (const expected of [
      "Vote · 8080",
      "Result · 8081",
      "Worker",
      "Redis",
      "DB",
      "Seed",
    ]) {
      if (!dockerRealServiceLabels.has(expected)) {
        fail(
          `docker-real-repo missing humanized service label ${expected}; found ${[...dockerRealServiceLabels].sort().join(" | ") || "(none)"}`,
        );
      } else {
        pass(`docker-real-repo service label ${expected}`);
      }
    }

    const dockerRealAppImages = dockerRealGraph.nodes.filter(
      (node) =>
        node.kind === "service" && node.metadata?.dockerfileService === true,
    );
    if (dockerRealAppImages.length > 0) {
      fail(
        `docker-real-repo should quiet Dockerfile App images owned by Compose build; found ${dockerRealAppImages.map((node) => node.label).join(", ")}`,
      );
    } else {
      pass("docker-real-repo quiets Dockerfile App images owned by Compose build");
    }

    // Overlay twin lock: one node per serviceName (not docker-compose.yml +
    // docker-compose.images.yml Vote/Result twins restating Deploy).
    if (dockerRealServices.length !== dockerRealServiceNames.size) {
      fail(
        `docker-real-repo expected overlay-deduped services (count === unique names), found ${dockerRealServices.length} nodes / ${dockerRealServiceNames.size} names (${dockerRealServices.map((node) => node.label).join(", ")})`,
      );
    } else {
      pass(
        `docker-real-repo overlay twins deduped (${dockerRealServices.length} services)`,
      );
    }
    if (dockerRealServices.length !== 6) {
      fail(
        `docker-real-repo expected exactly 6 compose services after overlay dedupe, found ${dockerRealServices.length}`,
      );
    } else {
      pass("docker-real-repo has exactly 6 compose services");
    }

    const dockerRealVote = dockerRealServices.find(
      (node) => node.metadata?.serviceName === "vote",
    );
    if (
      !Array.isArray(dockerRealVote?.metadata?.dependsOn) ||
      !dockerRealVote.metadata.dependsOn.includes("redis")
    ) {
      fail(
        `docker-real-repo vote dependsOn expected redis, found ${JSON.stringify(dockerRealVote?.metadata?.dependsOn)}`,
      );
    } else {
      pass("docker-real-repo vote depends_on redis");
    }
    if (dockerRealVote?.metadata?.build !== "./vote") {
      fail(
        `docker-real-repo vote build.context expected ./vote, found ${dockerRealVote?.metadata?.build ?? "(missing)"}`,
      );
    } else {
      pass("docker-real-repo vote build.context ./vote");
    }
    // images overlay supplies dockersamples/… — keep build + image together.
    if (
      dockerRealVote?.metadata?.image !==
      "dockersamples/examplevotingapp_vote"
    ) {
      fail(
        `docker-real-repo vote image expected dockersamples/examplevotingapp_vote from overlay, found ${dockerRealVote?.metadata?.image ?? "(missing)"}`,
      );
    } else {
      pass("docker-real-repo vote merges overlay image");
    }
    if (
      !Array.isArray(dockerRealVote?.metadata?.composeFiles) ||
      !dockerRealVote.metadata.composeFiles.some((file) =>
        /docker-compose\.yml$/i.test(String(file)),
      ) ||
      !dockerRealVote.metadata.composeFiles.some((file) =>
        /docker-compose\.images\.yml$/i.test(String(file)),
      )
    ) {
      fail(
        `docker-real-repo vote composeFiles should cite primary + images overlay, found ${JSON.stringify(dockerRealVote?.metadata?.composeFiles)}`,
      );
    } else {
      pass("docker-real-repo vote composeFiles cite primary + images overlay");
    }
    if (
      !/(?:^|\/)docker-compose\.yml$/i.test(
        String(dockerRealVote?.evidence?.[0]?.file ?? "").replaceAll("\\", "/"),
      )
    ) {
      fail(
        `docker-real-repo vote primary evidence should be docker-compose.yml, found ${dockerRealVote?.evidence?.[0]?.file ?? "(missing)"}`,
      );
    } else {
      pass("docker-real-repo vote primary evidence is docker-compose.yml");
    }

    const dockerRealNeedsEdges = dockerRealGraph.edges.filter(
      (edge) =>
        edge.kind === "depends-on" &&
        edge.label === "needs" &&
        dockerRealServices.some((node) => node.id === edge.source) &&
        dockerRealServices.some((node) => node.id === edge.target),
    );
    const dockerRealNeedsPairs = new Set(
      dockerRealNeedsEdges.map((edge) => {
        const from = dockerRealServices.find((node) => node.id === edge.source);
        const to = dockerRealServices.find((node) => node.id === edge.target);
        return `${from?.metadata?.serviceName}→${to?.metadata?.serviceName}`;
      }),
    );
    for (const expected of [
      "vote→redis",
      "result→db",
      "worker→redis",
      "worker→db",
      "seed→vote",
    ]) {
      if (![...dockerRealNeedsPairs].some((pair) => pair === expected)) {
        fail(
          `docker-real-repo missing depends_on edge ${expected}; found ${[...dockerRealNeedsPairs].sort().join(", ") || "(none)"}`,
        );
      } else {
        pass(`docker-real-repo depends_on ${expected}`);
      }
    }

    const dockerRealRedis = dockerRealServices.find(
      (node) => node.metadata?.serviceName === "redis",
    );
    if (dockerRealRedis?.metadata?.image !== "redis:alpine") {
      fail(
        `docker-real-repo redis image expected redis:alpine, found ${dockerRealRedis?.metadata?.image ?? "(missing)"}`,
      );
    } else {
      pass("docker-real-repo redis image label redis:alpine");
    }

    const nestedDockerRealServices = dockerRealServices.filter(
      (node) => node.parentId === dockerRealDeploy?.id,
    );
    if (nestedDockerRealServices.length !== 6) {
      fail(
        `docker-real-repo expected exactly 6 services nested under Deploy after overlay dedupe, found ${nestedDockerRealServices.length}`,
      );
    } else {
      pass(
        `docker-real-repo ${nestedDockerRealServices.length} services nested under Deploy (no overlay twins)`,
      );
    }

    const dockerRealOverviewLeaves = nestedDockerRealServices.filter(
      (node) => node.metadata?.collapsedInOverview !== true,
    );
    if (dockerRealOverviewLeaves.length > 0) {
      fail(
        `docker-real-repo overview should collapse services under Deploy, still visible: ${dockerRealOverviewLeaves
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass(
        "docker-real-repo services collapsed on overview (Deploy tells the story)",
      );
    }

    const dockerRealFlow = dockerRealSemantic
      .filter((node) => typeof node.metadata?.flowOrder === "number")
      .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
    const dockerRealFlowKeys = dockerRealFlow.map(
      (node) => node.metadata?.systemKey,
    );
    if (!dockerRealFlowKeys.includes("deploy")) {
      fail(
        `docker-real-repo flowOrder expected Deploy, got ${dockerRealFlow.map((node) => node.label).join(" → ") || "(none)"}`,
      );
    } else {
      pass(
        `docker-real-repo flowOrder includes Deploy: ${dockerRealFlow.map((node) => node.label).join(" → ")}`,
      );
    }

    const dockerRealModules = dockerRealGraph.nodes.filter(
      (node) => node.kind === "module" && node.metadata?.dockerModule === true,
    );
    const dockerRealComposeModule = dockerRealModules.find((node) =>
      /(?:^|\/)docker-compose\.yml$/i.test(
        String(node.metadata?.file ?? node.label).replaceAll("\\", "/"),
      ),
    );
    if (
      !dockerRealComposeModule ||
      dockerRealComposeModule.parentId !== dockerRealDeploy?.id ||
      dockerRealComposeModule.metadata?.collapsedInOverview !== true
    ) {
      fail(
        `docker-real-repo docker-compose.yml should nest+collapse under Deploy, found parent=${dockerRealComposeModule?.parentId ?? "(missing)"} collapsed=${dockerRealComposeModule?.metadata?.collapsedInOverview}`,
      );
    } else {
      pass("docker-real-repo docker-compose.yml nested+collapsed under Deploy");
    }

    const dockerRealEvidenceGaps = dockerRealServices.filter((node) => {
      const detail = node.evidence?.[0]?.detail ?? "";
      const name = node.metadata?.serviceName;
      return typeof name !== "string" || !detail.includes(`service:${name}`);
    });
    if (dockerRealEvidenceGaps.length > 0) {
      fail(
        `docker-real-repo evidence should cite service: ${dockerRealEvidenceGaps
          .map((node) => node.metadata?.serviceName ?? node.label)
          .join(", ")}`,
      );
    } else {
      pass("docker-real-repo evidence details cite service:");
    }

    // After overlay dedupe, every core service keeps primary compose evidence.
    const primaryNames = new Set(
      dockerRealServices
        .filter((node) =>
          /(?:^|\/)docker-compose\.yml$/i.test(
            String(node.evidence?.[0]?.file ?? "").replaceAll("\\", "/"),
          ),
        )
        .map((node) => node.metadata?.serviceName),
    );
    for (const expected of [
      "vote",
      "result",
      "worker",
      "redis",
      "db",
      "seed",
    ]) {
      if (!primaryNames.has(expected)) {
        fail(
          `docker-real-repo docker-compose.yml missing service ${expected}; found ${[...primaryNames].sort().join(", ") || "(none)"}`,
        );
      } else {
        pass(`docker-real-repo docker-compose.yml has service ${expected}`);
      }
    }

    const dockerRealCommerceNoise = dockerRealGraph.edges.some((edge) =>
      /checkout|orders?/i.test(
        `${edge.label ?? ""} ${JSON.stringify(edge.metadata ?? {})}`,
      ),
    );
    if (dockerRealCommerceNoise) {
      fail(
        "docker-real-repo should not inherit Checkout/orders commerce collaboration copy",
      );
    } else {
      pass(
        "docker-real-repo has no Checkout/orders commerce collaboration noise",
      );
    }

    // Deploy must stay visible on overview when Compose services exist (not
    // Dockerfile-only packaging chrome).
    if (dockerRealDeploy.metadata?.collapsedInOverview === true) {
      fail(
        "docker-real-repo Deploy with Compose services should stay visible on overview",
      );
    } else {
      pass("docker-real-repo Deploy stays visible on overview (Compose story)");
    }

    // North-star lock: thin GET / from result/server.js must not lead the
    // overview — Deploy owns the cold-read (HTTP API collapsed chrome).
    const dockerRealApi = dockerRealByKey.get("api");
    const dockerRealRoutes = dockerRealGraph.nodes.filter(
      (node) => node.kind === "route",
    );
    if (
      !dockerRealApi ||
      dockerRealApi.metadata?.collapsedInOverview !== true
    ) {
      fail(
        `docker-real-repo thin HTTP API should collapse on overview beside Compose Deploy, found collapsed=${dockerRealApi?.metadata?.collapsedInOverview}`,
      );
    } else {
      pass("docker-real-repo thin HTTP API collapsed on overview (Deploy-led)");
    }
    if (
      dockerRealRoutes.length < 1 ||
      !dockerRealRoutes.every(
        (node) =>
          node.metadata?.path === "/" ||
          node.label === "GET /" ||
          node.label === "GET API",
      )
    ) {
      fail(
        `docker-real-repo expected only thin root routes under HTTP API, found ${dockerRealRoutes
          .map((node) => node.label)
          .join(", ") || "(none)"}`,
      );
    } else {
      pass(
        `docker-real-repo HTTP API is thin root chrome (${dockerRealRoutes.length} route)`,
      );
    }
    if (
      dockerRealFlow.length !== 1 ||
      dockerRealFlow[0]?.metadata?.systemKey !== "deploy"
    ) {
      fail(
        `docker-real-repo flowOrder expected Deploy-only North-star band, got ${dockerRealFlow.map((node) => node.label).join(" → ") || "(none)"}`,
      );
    } else {
      pass("docker-real-repo flowOrder is Deploy-only (North-star lock)");
    }
    const dockerRealOverviewSystems = dockerRealSemantic.filter(
      (node) => node.metadata?.collapsedInOverview !== true,
    );
    if (
      dockerRealOverviewSystems.length !== 1 ||
      dockerRealOverviewSystems[0]?.metadata?.systemKey !== "deploy"
    ) {
      fail(
        `docker-real-repo overview systems expected Deploy only, found ${dockerRealOverviewSystems
          .map((node) => node.label)
          .join(", ") || "(none)"}`,
      );
    } else {
      pass("docker-real-repo overview systems: Deploy only (Rung 7 locked)");
    }
  }
}

// ---------------------------------------------------------------------------
// Capability ladder rung 8 prep: Terraform extractor + mini-terraform smoke.
// ---------------------------------------------------------------------------
const miniTerraformGraph = await compileRepository(miniTerraformRoot);
const miniTerraformServices = miniTerraformGraph.nodes.filter(
  (node) => node.kind === "service" && node.metadata?.terraform === true,
);
const miniTerraformServiceLabels = miniTerraformServices.map(
  (node) => node.label,
);
console.log(
  `Mini-terraform graph: ${miniTerraformGraph.nodes.length} nodes, ${miniTerraformGraph.edges.length} edges → services ${[...new Set(miniTerraformServiceLabels)].sort().join(", ")}`,
);

const miniTerraformProduct = miniTerraformGraph.nodes.find(
  (node) => node.kind === "product",
);
if (!miniTerraformProduct || miniTerraformProduct.label !== "Mini Terraform notes") {
  fail(
    `mini-terraform product label expected 'Mini Terraform notes', found '${miniTerraformProduct?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-terraform product labeled Mini Terraform notes");
}

const miniTerraformExtractors = miniTerraformGraph.extractors.map(
  (item) => item.id,
);
if (!miniTerraformExtractors.includes("terraform")) {
  fail(
    `mini-terraform graph.extractors missing terraform; found ${JSON.stringify(miniTerraformExtractors)}`,
  );
} else {
  pass("mini-terraform registers terraform extractor");
}

const miniTerraformResources = miniTerraformServices.filter(
  (node) => node.metadata?.terraformResource === true,
);
const miniTerraformModules = miniTerraformServices.filter(
  (node) => node.metadata?.terraformModuleBlock === true,
);
const miniTerraformAddresses = new Set(
  miniTerraformResources.map((node) => node.metadata?.address),
);
for (const expected of [
  "aws_vpc.this",
  "aws_s3_bucket.notes",
  "aws_dynamodb_table.items",
  "aws_lambda_function.api",
]) {
  if (!miniTerraformAddresses.has(expected)) {
    fail(
      `mini-terraform missing resource ${expected}; found ${[...miniTerraformAddresses].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-terraform has resource ${expected}`);
  }
}

const miniTerraformModuleNames = new Set(
  miniTerraformModules.map((node) => node.metadata?.moduleName),
);
if (!miniTerraformModuleNames.has("network")) {
  fail(
    `mini-terraform missing module network; found ${[...miniTerraformModuleNames].join(", ") || "(none)"}`,
  );
} else {
  pass("mini-terraform has module network");
}

for (const expected of [
  "VPC",
  "Notes · S3 bucket",
  "Items · DynamoDB table",
  "API · Lambda function",
  "Network",
]) {
  if (!miniTerraformServiceLabels.includes(expected)) {
    fail(
      `mini-terraform missing humanized service label ${expected}; found ${miniTerraformServiceLabels.join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-terraform service label ${expected}`);
  }
}

if (miniTerraformServiceLabels.some((label) => /^This ·/i.test(label))) {
  fail(
    `mini-terraform should drop singleton 'this' name chrome; found ${miniTerraformServiceLabels
      .filter((label) => /^This ·/i.test(label))
      .join(", ")}`,
  );
} else {
  pass("mini-terraform drops singleton 'this' Terraform name chrome");
}

const miniTerraformSemantic = miniTerraformGraph.nodes.filter(
  (node) => node.metadata?.projection === "semantic",
);
const miniTerraformByKey = new Map(
  miniTerraformSemantic
    .filter((node) => typeof node.metadata?.systemKey === "string")
    .map((node) => [node.metadata.systemKey, node]),
);
const miniTerraformDeploy = miniTerraformByKey.get("deploy");
if (!miniTerraformDeploy || miniTerraformDeploy.label !== "Infrastructure") {
  fail(
    `mini-terraform Deploy label expected 'Infrastructure' from README, found '${miniTerraformDeploy?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-terraform Deploy labeled Infrastructure");
}

const nestedTerraformServices = miniTerraformServices.filter(
  (node) => node.parentId === miniTerraformDeploy?.id,
);
if (nestedTerraformServices.length < 4) {
  fail(
    `mini-terraform expected ≥4 terraform units nested under Infrastructure, found ${nestedTerraformServices.length}`,
  );
} else {
  pass(
    `mini-terraform ${nestedTerraformServices.length} units nested under Infrastructure`,
  );
}

const terraformOverviewLeaves = nestedTerraformServices.filter(
  (node) => node.metadata?.collapsedInOverview !== true,
);
if (terraformOverviewLeaves.length > 0) {
  fail(
    `mini-terraform overview should collapse resources/modules under Infrastructure, still visible: ${terraformOverviewLeaves
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-terraform overview collapses resources/modules under Infrastructure");
}

const miniTerraformFlow = miniTerraformSemantic
  .filter((node) => typeof node.metadata?.flowOrder === "number")
  .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
if (
  miniTerraformFlow.length < 1 ||
  miniTerraformFlow[0]?.metadata?.systemKey !== "deploy"
) {
  fail(
    `mini-terraform flowOrder expected Infrastructure/Deploy, got ${miniTerraformFlow.map((node) => node.label).join(" → ") || "(none)"}`,
  );
} else {
  pass(
    `mini-terraform flowOrder: ${miniTerraformFlow.map((node) => node.label).join(" → ")}`,
  );
}

const miniTerraformTfModules = miniTerraformGraph.nodes.filter(
  (node) => node.kind === "module" && node.metadata?.terraformModule === true,
);
if (
  !miniTerraformTfModules.some((node) =>
    String(node.metadata?.file ?? node.label)
      .replaceAll("\\", "/")
      .endsWith("main.tf"),
  )
) {
  fail("mini-terraform missing main.tf module");
} else {
  pass("mini-terraform has main.tf module");
}

const terraformModuleChrome = miniTerraformTfModules.filter(
  (node) => node.metadata?.collapsedInOverview !== true,
);
if (terraformModuleChrome.length > 0) {
  fail(
    `mini-terraform overview should collapse .tf modules, still visible: ${terraformModuleChrome
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-terraform overview collapses .tf modules");
}

const terraformEvidenceGaps = miniTerraformServices.filter((node) => {
  const detail = node.evidence[0]?.detail ?? "";
  return !/^(resource:|module:)/.test(detail);
});
if (terraformEvidenceGaps.length > 0) {
  fail(
    `mini-terraform evidence should cite resource:/module: ${terraformEvidenceGaps
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-terraform evidence details cite resource/module");
}

const networkModule = miniTerraformModules.find(
  (node) => node.metadata?.moduleName === "network",
);
if (networkModule?.metadata?.moduleSource !== "./modules/network") {
  fail(
    `mini-terraform network moduleSource expected ./modules/network, found ${networkModule?.metadata?.moduleSource ?? "(missing)"}`,
  );
} else {
  pass("mini-terraform network module source ./modules/network");
}

const terraformCommerceNoise = miniTerraformGraph.edges.some((edge) =>
  /checkout|orders?/i.test(
    `${edge.label ?? ""} ${JSON.stringify(edge.metadata ?? {})}`,
  ),
);
if (terraformCommerceNoise) {
  fail(
    "mini-terraform should not inherit Checkout/orders commerce collaboration copy",
  );
} else {
  pass("mini-terraform has no Checkout/orders commerce collaboration noise");
}

// ---------------------------------------------------------------------------
// Capability ladder rung 8: real Terraform repo (pinned SHA, gitignored).
// Golden-lock terraform-aws-modules/terraform-aws-vpc resources under Deploy.
// ---------------------------------------------------------------------------
let terraformRealRoot;
try {
  terraformRealRoot = await ensureRealRepo(TERRAFORM_AWS_VPC);
  pass(
    `terraform real repo ${TERRAFORM_AWS_VPC.name} ready @ ${TERRAFORM_AWS_VPC.sha.slice(0, 12)}`,
  );
} catch (error) {
  fail(
    `could not ensure terraform real repo ${TERRAFORM_AWS_VPC.name}@${TERRAFORM_AWS_VPC.sha}: ${error instanceof Error ? error.message : error}`,
  );
}

if (terraformRealRoot) {
  let terraformRealGraph;
  try {
    terraformRealGraph = await compileRepository(terraformRealRoot);
    pass(
      `terraform-real-repo scan completed: ${terraformRealGraph.nodes.length} nodes, ${terraformRealGraph.edges.length} edges`,
    );
  } catch (error) {
    fail(
      `terraform-real-repo scan crashed on ${TERRAFORM_AWS_VPC.name}: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (terraformRealGraph) {
    const terraformRealServices = terraformRealGraph.nodes.filter(
      (node) => node.kind === "service" && node.metadata?.terraform === true,
    );
    const terraformRealResources = terraformRealServices.filter(
      (node) => node.metadata?.terraformResource === true,
    );
    const terraformRealModuleBlocks = terraformRealServices.filter(
      (node) => node.metadata?.terraformModuleBlock === true,
    );
    const terraformRealSemantic = terraformRealGraph.nodes.filter(
      (node) => node.metadata?.projection === "semantic",
    );
    const terraformRealProduct = terraformRealGraph.nodes.find(
      (node) => node.kind === "product",
    );
    const terraformRealByKey = new Map(
      terraformRealSemantic
        .filter((node) => typeof node.metadata?.systemKey === "string")
        .map((node) => [node.metadata.systemKey, node]),
    );
    const terraformRealDeploy = terraformRealByKey.get("deploy");
    const terraformRealAddresses = new Set(
      terraformRealResources.map((node) => node.metadata?.address),
    );
    const terraformRealLabels = new Set(
      terraformRealServices.map((node) => node.label),
    );

    const terraformRealSummary = {
      pin: `${TERRAFORM_AWS_VPC.name}@${TERRAFORM_AWS_VPC.sha}`,
      product: terraformRealProduct?.label ?? null,
      nodes: terraformRealGraph.nodes.length,
      edges: terraformRealGraph.edges.length,
      resources: terraformRealResources.length,
      moduleBlocks: terraformRealModuleBlocks.length,
      semantic: terraformRealSemantic.map((node) => node.label),
    };
    console.log(
      `Terraform-real-repo scan summary: ${JSON.stringify(terraformRealSummary)}`,
    );

    if (
      !terraformRealProduct ||
      terraformRealProduct.label !== "AWS VPC Terraform module"
    ) {
      fail(
        `terraform-real-repo product label expected 'AWS VPC Terraform module', found '${terraformRealProduct?.label ?? "(missing)"}'`,
      );
    } else {
      pass(`terraform-real-repo product label: ${terraformRealProduct.label}`);
    }

    if (!terraformRealDeploy || terraformRealDeploy.label !== "Deploy") {
      fail(
        `terraform-real-repo deploy system label expected 'Deploy', found '${terraformRealDeploy?.label ?? "(missing)"}'`,
      );
    } else {
      pass("terraform-real-repo deploy system labeled 'Deploy'");
    }

    if (!terraformRealGraph.extractors.some((item) => item.id === "terraform")) {
      fail("terraform-real-repo graph.extractors missing terraform");
    } else {
      pass("terraform-real-repo registers terraform extractor");
    }

    if (terraformRealResources.length < 40) {
      fail(
        `terraform-real-repo expected ≥40 terraform resources, found ${terraformRealResources.length}`,
      );
    } else {
      pass(
        `terraform-real-repo ${terraformRealResources.length} terraform resources`,
      );
    }

    for (const expected of [
      "aws_vpc.this",
      "aws_subnet.public",
      "aws_subnet.private",
      "aws_nat_gateway.this",
      "aws_internet_gateway.this",
      "aws_route_table.public",
      "aws_eip.nat",
      "aws_flow_log.this",
      "aws_db_subnet_group.database",
    ]) {
      if (!terraformRealAddresses.has(expected)) {
        fail(
          `terraform-real-repo missing resource ${expected}; found ${[...terraformRealAddresses].sort().slice(0, 20).join(", ") || "(none)"}…`,
        );
      } else {
        pass(`terraform-real-repo has resource ${expected}`);
      }
    }

    for (const expected of [
      "VPC",
      "Public · Subnet",
      "Private · Subnet",
      "NAT gateway",
      "Internet gateway",
      "Public · Route table",
      "NAT · EIP",
      "Flow log",
      "Database · DB subnet group",
      "VPC endpoints",
      "S3 bucket",
    ]) {
      if (!terraformRealLabels.has(expected)) {
        fail(
          `terraform-real-repo missing humanized service label ${expected}; found ${[...terraformRealLabels].sort().slice(0, 25).join(" | ") || "(none)"}…`,
        );
      } else {
        pass(`terraform-real-repo service label ${expected}`);
      }
    }

    const terraformThisChrome = [...terraformRealLabels].filter((label) =>
      /^This ·/i.test(label),
    );
    if (terraformThisChrome.length > 0) {
      fail(
        `terraform-real-repo should drop singleton 'this' name chrome; found ${terraformThisChrome
          .slice(0, 8)
          .join(", ")}`,
      );
    } else {
      pass("terraform-real-repo drops singleton 'this' Terraform name chrome");
    }

    const terraformIssueModules = terraformRealModuleBlocks.filter((node) =>
      /_issue_/i.test(String(node.metadata?.moduleName ?? "")),
    );
    if (terraformIssueModules.length < 3) {
      fail(
        `terraform-real-repo expected ≥3 vpc_issue_* modules to quiet, found ${terraformIssueModules.length}`,
      );
    } else if (
      terraformIssueModules.some(
        (node) => node.metadata?.exampleChrome !== true,
      )
    ) {
      fail(
        `terraform-real-repo vpc_issue_* modules should be exampleChrome; found ${terraformIssueModules
          .filter((node) => node.metadata?.exampleChrome !== true)
          .map((node) => node.label)
          .join(", ") || "(none)"}`,
      );
    } else {
      pass(
        `terraform-real-repo ${terraformIssueModules.length} vpc_issue_* modules marked exampleChrome`,
      );
    }

    const terraformExampleChrome = terraformRealServices.filter(
      (node) => node.metadata?.exampleChrome === true,
    );
    if (terraformExampleChrome.length < 10) {
      fail(
        `terraform-real-repo expected ≥10 exampleChrome services (examples/wrappers modules), found ${terraformExampleChrome.length}`,
      );
    } else {
      pass(
        `terraform-real-repo ${terraformExampleChrome.length} example/wrapper module services quieted as exampleChrome`,
      );
    }

    const nestedTerraformReal = terraformRealServices.filter(
      (node) => node.parentId === terraformRealDeploy?.id,
    );
    if (nestedTerraformReal.length < 50) {
      fail(
        `terraform-real-repo expected ≥50 terraform units nested under Deploy, found ${nestedTerraformReal.length}`,
      );
    } else {
      pass(
        `terraform-real-repo ${nestedTerraformReal.length} units nested under Deploy`,
      );
    }

    const terraformRealOverviewLeaves = nestedTerraformReal.filter(
      (node) => node.metadata?.collapsedInOverview !== true,
    );
    if (terraformRealOverviewLeaves.length > 0) {
      fail(
        `terraform-real-repo overview should collapse resources/modules under Deploy, still visible: ${terraformRealOverviewLeaves
          .map((node) => node.label)
          .slice(0, 12)
          .join(", ")}`,
      );
    } else {
      pass(
        "terraform-real-repo services collapsed on overview (Deploy tells the story)",
      );
    }

    const terraformRealFlow = terraformRealSemantic
      .filter((node) => typeof node.metadata?.flowOrder === "number")
      .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
    if (
      terraformRealFlow.length !== 1 ||
      terraformRealFlow[0]?.metadata?.systemKey !== "deploy"
    ) {
      fail(
        `terraform-real-repo flowOrder expected Deploy-only, got ${terraformRealFlow.map((node) => node.label).join(" → ") || "(none)"}`,
      );
    } else {
      pass("terraform-real-repo flowOrder is Deploy-only");
    }

    if (terraformRealDeploy.metadata?.collapsedInOverview === true) {
      fail(
        "terraform-real-repo Deploy with Terraform units should stay visible on overview",
      );
    } else {
      pass("terraform-real-repo Deploy stays visible on overview");
    }

    const terraformRealOverviewSystems = terraformRealSemantic.filter(
      (node) => node.metadata?.collapsedInOverview !== true,
    );
    if (
      terraformRealOverviewSystems.length !== 1 ||
      terraformRealOverviewSystems[0]?.metadata?.systemKey !== "deploy"
    ) {
      fail(
        `terraform-real-repo overview systems expected Deploy only, found ${terraformRealOverviewSystems
          .map((node) => node.label)
          .join(", ") || "(none)"}`,
      );
    } else {
      pass("terraform-real-repo overview systems: Deploy only");
    }

    const terraformRealTfModules = terraformRealGraph.nodes.filter(
      (node) => node.kind === "module" && node.metadata?.terraformModule === true,
    );
    // Prefer the module-root main.tf — examples/*/main.tf also match a bare
    // basename regex and are correctly marked exampleChrome.
    const terraformRealMainTf =
      terraformRealTfModules.find(
        (node) =>
          String(node.metadata?.file ?? node.label).replaceAll("\\", "/") ===
          "main.tf",
      ) ??
      terraformRealTfModules.find((node) => {
        const file = String(node.metadata?.file ?? node.label).replaceAll(
          "\\",
          "/",
        );
        return (
          /(?:^|\/)main\.tf$/i.test(file) &&
          !/(^|\/)(examples|wrappers)\//i.test(file)
        );
      });
    if (
      !terraformRealMainTf ||
      terraformRealMainTf.parentId !== terraformRealDeploy?.id ||
      terraformRealMainTf.metadata?.collapsedInOverview !== true
    ) {
      fail(
        `terraform-real-repo main.tf should nest+collapse under Deploy, found parent=${terraformRealMainTf?.parentId ?? "(missing)"} collapsed=${terraformRealMainTf?.metadata?.collapsedInOverview}`,
      );
    } else {
      pass("terraform-real-repo main.tf nested+collapsed under Deploy");
    }

    const terraformExampleTfModules = terraformRealTfModules.filter(
      (node) => node.metadata?.exampleChrome === true,
    );
    if (terraformExampleTfModules.length < 40) {
      fail(
        `terraform-real-repo expected ≥40 example/wrapper .tf modules quieted, found ${terraformExampleTfModules.length}`,
      );
    } else {
      pass(
        `terraform-real-repo ${terraformExampleTfModules.length} example/wrapper .tf modules quieted as exampleChrome`,
      );
    }

    if (terraformRealMainTf.metadata?.exampleChrome === true) {
      fail(
        "terraform-real-repo root main.tf must stay visible (not exampleChrome)",
      );
    } else {
      pass("terraform-real-repo root main.tf is not exampleChrome");
    }

    const terraformRealEvidenceGaps = terraformRealServices.filter((node) => {
      const detail = node.evidence?.[0]?.detail ?? "";
      return !/^(resource:|module:)/.test(detail);
    });
    if (terraformRealEvidenceGaps.length > 0) {
      fail(
        `terraform-real-repo evidence should cite resource:/module: ${terraformRealEvidenceGaps
          .map((node) => node.label)
          .slice(0, 8)
          .join(", ")}`,
      );
    } else {
      pass("terraform-real-repo evidence details cite resource/module");
    }

    const terraformRealVpcModule = terraformRealModuleBlocks.find(
      (node) => node.metadata?.moduleName === "vpc",
    );
    if (
      !terraformRealVpcModule ||
      terraformRealVpcModule.metadata?.moduleSource !== "../../"
    ) {
      fail(
        `terraform-real-repo examples module vpc source expected ../../, found ${terraformRealVpcModule?.metadata?.moduleSource ?? "(missing)"}`,
      );
    } else {
      pass("terraform-real-repo examples module vpc source ../../");
    }

    const terraformRealVpcEvidence = terraformRealResources.find(
      (node) => node.metadata?.address === "aws_vpc.this",
    );
    if (
      !/(?:^|\/)main\.tf$/i.test(
        String(terraformRealVpcEvidence?.evidence?.[0]?.file ?? "").replaceAll(
          "\\",
          "/",
        ),
      ) ||
      terraformRealVpcEvidence?.evidence?.[0]?.detail !== "resource:aws_vpc.this"
    ) {
      fail(
        `terraform-real-repo aws_vpc.this evidence expected main.tf resource:aws_vpc.this, found ${JSON.stringify(terraformRealVpcEvidence?.evidence?.[0])}`,
      );
    } else {
      pass("terraform-real-repo aws_vpc.this evidence is main.tf");
    }

    const terraformRealCommerceNoise = terraformRealGraph.edges.some((edge) =>
      /checkout|orders?/i.test(
        `${edge.label ?? ""} ${JSON.stringify(edge.metadata ?? {})}`,
      ),
    );
    if (terraformRealCommerceNoise) {
      fail(
        "terraform-real-repo should not inherit Checkout/orders commerce collaboration copy",
      );
    } else {
      pass(
        "terraform-real-repo has no Checkout/orders commerce collaboration noise",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Capability ladder rung 9 prep: Kubernetes extractor + mini-k8s smoke.
// ---------------------------------------------------------------------------
const miniK8sGraph = await compileRepository(miniK8sRoot);
const miniK8sServices = miniK8sGraph.nodes.filter(
  (node) => node.kind === "service" && node.metadata?.kubernetes === true,
);
const miniK8sServiceLabels = miniK8sServices.map((node) => node.label);
console.log(
  `Mini-k8s graph: ${miniK8sGraph.nodes.length} nodes, ${miniK8sGraph.edges.length} edges → services ${[...new Set(miniK8sServiceLabels)].sort().join(", ")}`,
);

const miniK8sProduct = miniK8sGraph.nodes.find((node) => node.kind === "product");
if (!miniK8sProduct || miniK8sProduct.label !== "Mini Kubernetes notes") {
  fail(
    `mini-k8s product label expected 'Mini Kubernetes notes', found '${miniK8sProduct?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-k8s product labeled Mini Kubernetes notes");
}

const miniK8sExtractors = miniK8sGraph.extractors.map((item) => item.id);
if (!miniK8sExtractors.includes("kubernetes")) {
  fail(
    `mini-k8s graph.extractors missing kubernetes; found ${JSON.stringify(miniK8sExtractors)}`,
  );
} else {
  pass("mini-k8s registers kubernetes extractor");
}

const miniK8sResources = miniK8sServices.filter(
  (node) => node.metadata?.kubernetesResource === true,
);
const miniK8sAddresses = new Set(
  miniK8sResources.map((node) => node.metadata?.address),
);
for (const expected of [
  "Deployment/api",
  "Service/api",
  "Deployment/web",
  "Ingress/notes",
]) {
  if (!miniK8sAddresses.has(expected)) {
    fail(
      `mini-k8s missing resource ${expected}; found ${[...miniK8sAddresses].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-k8s has resource ${expected}`);
  }
}

for (const expected of [
  "API · Deployment",
  "API · Service",
  "Web · Deployment",
  "Notes · notes.example.com",
]) {
  if (!miniK8sServiceLabels.includes(expected)) {
    fail(
      `mini-k8s missing humanized service label ${expected}; found ${miniK8sServiceLabels.join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-k8s service label ${expected}`);
  }
}

const miniK8sIngress = miniK8sServices.find(
  (node) => node.metadata?.k8sKind === "Ingress",
);
if (
  !Array.isArray(miniK8sIngress?.metadata?.hosts) ||
  !miniK8sIngress.metadata.hosts.includes("notes.example.com")
) {
  fail(
    `mini-k8s Ingress hosts expected ["notes.example.com"], found ${JSON.stringify(miniK8sIngress?.metadata?.hosts)}`,
  );
} else {
  pass("mini-k8s Ingress hosts notes.example.com");
}

const miniK8sNeedsEdges = miniK8sGraph.edges.filter(
  (edge) =>
    edge.kind === "depends-on" &&
    edge.label === "needs" &&
    miniK8sServices.some((node) => node.id === edge.source) &&
    miniK8sServices.some((node) => node.id === edge.target),
);
const miniK8sNeedsPairs = new Set(
  miniK8sNeedsEdges.map((edge) => {
    const from = miniK8sServices.find((node) => node.id === edge.source);
    const to = miniK8sServices.find((node) => node.id === edge.target);
    return `${from?.metadata?.k8sKind}/${from?.metadata?.resourceName}→${to?.metadata?.k8sKind}/${to?.metadata?.resourceName}`;
  }),
);
for (const expected of [
  "Service/api→Deployment/api",
  "Ingress/notes→Service/api",
]) {
  if (!miniK8sNeedsPairs.has(expected)) {
    fail(
      `mini-k8s missing selector/backend needs edge ${expected}; found ${[...miniK8sNeedsPairs].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-k8s needs ${expected}`);
  }
}

const miniK8sSemantic = miniK8sGraph.nodes.filter(
  (node) => node.metadata?.projection === "semantic",
);
const miniK8sByKey = new Map(
  miniK8sSemantic
    .filter((node) => typeof node.metadata?.systemKey === "string")
    .map((node) => [node.metadata.systemKey, node]),
);
const miniK8sDeploy = miniK8sByKey.get("deploy");
if (!miniK8sDeploy || miniK8sDeploy.label !== "Workloads") {
  fail(
    `mini-k8s Deploy label expected 'Workloads' from README, found '${miniK8sDeploy?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-k8s Deploy labeled Workloads");
}

const nestedK8sServices = miniK8sServices.filter(
  (node) => node.parentId === miniK8sDeploy?.id,
);
if (nestedK8sServices.length < 4) {
  fail(
    `mini-k8s expected ≥4 kubernetes units nested under Workloads, found ${nestedK8sServices.length}`,
  );
} else {
  pass(`mini-k8s ${nestedK8sServices.length} units nested under Workloads`);
}

const k8sOverviewLeaves = nestedK8sServices.filter(
  (node) => node.metadata?.collapsedInOverview !== true,
);
if (k8sOverviewLeaves.length > 0) {
  fail(
    `mini-k8s overview should collapse Deployments/Services/Ingress under Workloads, still visible: ${k8sOverviewLeaves
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-k8s overview collapses resources under Workloads");
}

const miniK8sFlow = miniK8sSemantic
  .filter((node) => typeof node.metadata?.flowOrder === "number")
  .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
if (
  miniK8sFlow.length !== 1 ||
  miniK8sFlow[0]?.metadata?.systemKey !== "deploy"
) {
  fail(
    `mini-k8s flowOrder expected Workloads/Deploy, got ${miniK8sFlow.map((node) => node.label).join(" → ") || "(none)"}`,
  );
} else {
  pass(
    `mini-k8s flowOrder: ${miniK8sFlow.map((node) => node.label).join(" → ")}`,
  );
}

const miniK8sModules = miniK8sGraph.nodes.filter(
  (node) => node.kind === "module" && node.metadata?.kubernetesModule === true,
);
const miniK8sApiModule = miniK8sModules.find((node) =>
  /(?:^|\/)k8s\/api\.ya?ml$/i.test(
    String(node.metadata?.file ?? node.label).replaceAll("\\", "/"),
  ),
);
if (
  !miniK8sApiModule ||
  miniK8sApiModule.parentId !== miniK8sDeploy?.id ||
  miniK8sApiModule.metadata?.collapsedInOverview !== true
) {
  fail(
    `mini-k8s k8s/api.yaml should nest+collapse under Workloads, found parent=${miniK8sApiModule?.parentId ?? "(missing)"} collapsed=${miniK8sApiModule?.metadata?.collapsedInOverview}`,
  );
} else {
  pass("mini-k8s k8s/api.yaml nested+collapsed under Workloads");
}

const k8sEvidenceGaps = miniK8sServices.filter((node) => {
  const detail = node.evidence?.[0]?.detail ?? "";
  return !/^kind:/.test(detail);
});
if (k8sEvidenceGaps.length > 0) {
  fail(
    `mini-k8s evidence should cite kind: ${k8sEvidenceGaps
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-k8s evidence details cite kind:");
}

const k8sCommerceNoise = miniK8sGraph.edges.some((edge) =>
  /checkout|orders?/i.test(
    `${edge.label ?? ""} ${JSON.stringify(edge.metadata ?? {})}`,
  ),
);
if (k8sCommerceNoise) {
  fail(
    "mini-k8s should not inherit Checkout/orders commerce collaboration copy",
  );
} else {
  pass("mini-k8s has no Checkout/orders commerce collaboration noise");
}

// ---------------------------------------------------------------------------
// Capability ladder rung 9: real Kubernetes repo (pinned SHA, gitignored).
// Golden-lock GoogleCloudPlatform/microservices-demo workloads under Deploy.
// ---------------------------------------------------------------------------
let k8sRealRoot;
try {
  k8sRealRoot = await ensureRealRepo(MICROSERVICES_DEMO);
  pass(
    `kubernetes real repo ${MICROSERVICES_DEMO.name} ready @ ${MICROSERVICES_DEMO.sha.slice(0, 12)}`,
  );
} catch (error) {
  fail(
    `could not ensure kubernetes real repo ${MICROSERVICES_DEMO.name}@${MICROSERVICES_DEMO.sha}: ${error instanceof Error ? error.message : error}`,
  );
}

if (k8sRealRoot) {
  let k8sRealGraph;
  try {
    k8sRealGraph = await compileRepository(k8sRealRoot);
    pass(
      `kubernetes-real-repo scan completed: ${k8sRealGraph.nodes.length} nodes, ${k8sRealGraph.edges.length} edges`,
    );
  } catch (error) {
    fail(
      `kubernetes-real-repo scan crashed on ${MICROSERVICES_DEMO.name}: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (k8sRealGraph) {
    const k8sRealServices = k8sRealGraph.nodes.filter(
      (node) => node.kind === "service" && node.metadata?.kubernetes === true,
    );
    const k8sRealResources = k8sRealServices.filter(
      (node) => node.metadata?.kubernetesResource === true,
    );
    const k8sRealSemantic = k8sRealGraph.nodes.filter(
      (node) => node.metadata?.projection === "semantic",
    );
    const k8sRealProduct = k8sRealGraph.nodes.find(
      (node) => node.kind === "product",
    );
    const k8sRealByKey = new Map(
      k8sRealSemantic
        .filter((node) => typeof node.metadata?.systemKey === "string")
        .map((node) => [node.metadata.systemKey, node]),
    );
    const k8sRealDeploy = k8sRealByKey.get("deploy");
    const k8sRealAddresses = new Set(
      k8sRealResources.map((node) => node.metadata?.address),
    );
    const k8sRealLabels = new Set(
      k8sRealServices.map((node) => node.label),
    );

    const k8sRealSummary = {
      pin: `${MICROSERVICES_DEMO.name}@${MICROSERVICES_DEMO.sha}`,
      product: k8sRealProduct?.label ?? null,
      nodes: k8sRealGraph.nodes.length,
      edges: k8sRealGraph.edges.length,
      resources: k8sRealResources.length,
      semantic: k8sRealSemantic.map((node) => node.label),
    };
    console.log(
      `Kubernetes-real-repo scan summary: ${JSON.stringify(k8sRealSummary)}`,
    );

    if (!k8sRealProduct || k8sRealProduct.label !== "Online Boutique") {
      fail(
        `kubernetes-real-repo product label expected 'Online Boutique', found '${k8sRealProduct?.label ?? "(missing)"}'`,
      );
    } else {
      pass(`kubernetes-real-repo product label: ${k8sRealProduct.label}`);
    }

    if (!k8sRealDeploy || k8sRealDeploy.label !== "Deploy") {
      fail(
        `kubernetes-real-repo deploy system label expected 'Deploy', found '${k8sRealDeploy?.label ?? "(missing)"}'`,
      );
    } else {
      pass("kubernetes-real-repo deploy system labeled 'Deploy'");
    }

    if (!k8sRealGraph.extractors.some((item) => item.id === "kubernetes")) {
      fail("kubernetes-real-repo graph.extractors missing kubernetes");
    } else {
      pass("kubernetes-real-repo registers kubernetes extractor");
    }

    if (k8sRealResources.length < 20) {
      fail(
        `kubernetes-real-repo expected ≥20 kubernetes resources, found ${k8sRealResources.length}`,
      );
    } else {
      pass(
        `kubernetes-real-repo ${k8sRealResources.length} kubernetes resources`,
      );
    }

    for (const expected of [
      "Deployment/frontend",
      "Service/frontend",
      "Deployment/cartservice",
      "Service/cartservice",
      "Deployment/checkoutservice",
      "Service/checkoutservice",
      "Deployment/productcatalogservice",
      "Service/productcatalogservice",
      "Deployment/recommendationservice",
      "Service/recommendationservice",
      "Deployment/paymentservice",
      "Service/paymentservice",
      "Deployment/shippingservice",
      "Service/shippingservice",
      "Deployment/emailservice",
      "Service/emailservice",
      "Deployment/currencyservice",
      "Service/currencyservice",
      "Deployment/adservice",
      "Service/adservice",
      "Deployment/redis-cart",
      "Service/redis-cart",
      "Deployment/loadgenerator",
    ]) {
      if (!k8sRealAddresses.has(expected)) {
        fail(
          `kubernetes-real-repo missing resource ${expected}; found ${[...k8sRealAddresses].sort().slice(0, 20).join(", ") || "(none)"}…`,
        );
      } else {
        pass(`kubernetes-real-repo has resource ${expected}`);
      }
    }

    for (const expected of [
      "Frontend · Deployment",
      "Frontend · Service",
      "Cart service · Deployment",
      "Cart service · Service",
      "Checkout service · Deployment",
      "Product catalog service · Deployment",
      "Product catalog service · Service",
      "Recommendation service · Deployment",
      "Payment service · Deployment",
      "Shipping service · Deployment",
      "Email service · Deployment",
      "Currency service · Deployment",
      "Ad service · Deployment",
      "Redis cart · Deployment",
      "Load generator · Deployment",
      // Kustomize overlay chrome (Details) still needs North-star labels.
      "Shopping assistant service · Deployment",
      "OpenTelemetry collector · Deployment",
    ]) {
      if (!k8sRealLabels.has(expected)) {
        fail(
          `kubernetes-real-repo missing humanized service label ${expected}; found ${[...k8sRealLabels].sort().slice(0, 25).join(" | ") || "(none)"}…`,
        );
      } else {
        pass(`kubernetes-real-repo service label ${expected}`);
      }
    }

    const k8sHelmChrome = [...k8sRealLabels].filter((label) =>
      /\{\{/.test(label),
    );
    if (k8sHelmChrome.length > 0) {
      fail(
        `kubernetes-real-repo should skip Helm template placeholder names; found ${k8sHelmChrome
          .slice(0, 8)
          .join(", ")}`,
      );
    } else {
      pass("kubernetes-real-repo skips Helm {{ .Values }} chrome");
    }

    const k8sGithubChrome = k8sRealResources.filter((node) =>
      /\.github\//i.test(
        String(node.evidence?.[0]?.file ?? "").replaceAll("\\", "/"),
      ),
    );
    if (k8sGithubChrome.length > 0) {
      fail(
        `kubernetes-real-repo should skip .github CI manifests; found ${k8sGithubChrome
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass("kubernetes-real-repo skips .github CI kubernetes manifests");
    }

    const nestedK8sReal = k8sRealServices.filter(
      (node) => node.parentId === k8sRealDeploy?.id,
    );
    if (nestedK8sReal.length < 20) {
      fail(
        `kubernetes-real-repo expected ≥20 kubernetes units nested under Deploy, found ${nestedK8sReal.length}`,
      );
    } else {
      pass(
        `kubernetes-real-repo ${nestedK8sReal.length} units nested under Deploy`,
      );
    }

    const k8sRealOverviewLeaves = nestedK8sReal.filter(
      (node) => node.metadata?.collapsedInOverview !== true,
    );
    if (k8sRealOverviewLeaves.length > 0) {
      fail(
        `kubernetes-real-repo overview should collapse Deployments/Services under Deploy, still visible: ${k8sRealOverviewLeaves
          .map((node) => node.label)
          .slice(0, 12)
          .join(", ")}`,
      );
    } else {
      pass(
        "kubernetes-real-repo services collapsed on overview (Deploy tells the story)",
      );
    }

    if (k8sRealDeploy.metadata?.collapsedInOverview === true) {
      fail(
        "kubernetes-real-repo Deploy with Kubernetes units should stay visible on overview",
      );
    } else {
      pass("kubernetes-real-repo Deploy stays visible on overview");
    }

    const k8sRealFlow = k8sRealSemantic
      .filter((node) => typeof node.metadata?.flowOrder === "number")
      .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
    if (
      k8sRealFlow.length !== 1 ||
      k8sRealFlow[0]?.metadata?.systemKey !== "deploy"
    ) {
      fail(
        `kubernetes-real-repo flowOrder expected Deploy-only, got ${k8sRealFlow.map((node) => node.label).join(" → ") || "(none)"}`,
      );
    } else {
      pass(
        `kubernetes-real-repo flowOrder: ${k8sRealFlow.map((node) => node.label).join(" → ")}`,
      );
    }

    const k8sRealApi = k8sRealByKey.get("api");
    if (
      k8sRealApi &&
      k8sRealApi.metadata?.collapsedInOverview !== true
    ) {
      fail(
        `kubernetes-real-repo thin/empty HTTP API should collapse on overview beside Kubernetes Deploy, found collapsed=${k8sRealApi.metadata?.collapsedInOverview}`,
      );
    } else {
      pass(
        "kubernetes-real-repo thin HTTP API collapsed on overview (Deploy-led)",
      );
    }

    const k8sKustomizeChrome = k8sRealResources.filter(
      (node) =>
        node.metadata?.kustomizeChrome === true ||
        /(?:^|\/)kustomize\//i.test(
          String(node.evidence?.[0]?.file ?? "").replaceAll("\\", "/"),
        ),
    );
    if (k8sKustomizeChrome.length === 0) {
      fail(
        "kubernetes-real-repo expected kustomize/ overlay resources marked as chrome",
      );
    } else if (
      k8sKustomizeChrome.some(
        (node) =>
          node.metadata?.collapsedInOverview !== true ||
          node.metadata?.exampleChrome !== true,
      )
    ) {
      fail(
        `kubernetes-real-repo kustomize chrome should collapse on overview; visible: ${k8sKustomizeChrome
          .filter((node) => node.metadata?.collapsedInOverview !== true)
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass(
        `kubernetes-real-repo ${k8sKustomizeChrome.length} kustomize overlay units quieted as chrome`,
      );
    }

    // Overlay hubs from kustomization.yaml must also stay quiet beside
    // kubernetes-manifests (Rung 11 prep — product overlays only when kustomize-led).
    const k8sOverlayHubs = k8sRealGraph.nodes.filter(
      (node) =>
        node.kind === "service" && node.metadata?.kustomization === true,
    );
    if (k8sOverlayHubs.length === 0) {
      fail(
        "kubernetes-real-repo expected Overlay hubs from kustomize/**/kustomization.yaml",
      );
    } else if (
      k8sOverlayHubs.some(
        (node) =>
          node.metadata?.exampleChrome !== true ||
          node.metadata?.collapsedInOverview !== true ||
          node.metadata?.overviewHub === true,
      )
    ) {
      fail(
        `kubernetes-real-repo Overlay hubs should quiet beside kubernetes-manifests; found ${k8sOverlayHubs
          .filter(
            (node) =>
              node.metadata?.exampleChrome !== true ||
              node.metadata?.overviewHub === true,
          )
          .map((node) => node.label)
          .join(", ") || "(none visible)"}`,
      );
    } else {
      pass(
        `kubernetes-real-repo ${k8sOverlayHubs.length} Overlay hubs quieted beside kubernetes-manifests`,
      );
    }

    const k8sRealNeedsEdges = k8sRealGraph.edges.filter(
      (edge) =>
        edge.kind === "depends-on" &&
        edge.label === "needs" &&
        k8sRealServices.some((node) => node.id === edge.source) &&
        k8sRealServices.some((node) => node.id === edge.target),
    );
    const k8sRealNeedsPairs = new Set(
      k8sRealNeedsEdges.map((edge) => {
        const from = k8sRealServices.find((node) => node.id === edge.source);
        const to = k8sRealServices.find((node) => node.id === edge.target);
        return `${from?.metadata?.k8sKind}/${from?.metadata?.resourceName}→${to?.metadata?.k8sKind}/${to?.metadata?.resourceName}`;
      }),
    );
    for (const expected of [
      "Service/frontend→Deployment/frontend",
      "Service/cartservice→Deployment/cartservice",
      "Service/frontend-external→Deployment/frontend",
    ]) {
      if (!k8sRealNeedsPairs.has(expected)) {
        fail(
          `kubernetes-real-repo missing selector needs edge ${expected}; found ${[...k8sRealNeedsPairs].sort().slice(0, 12).join(", ") || "(none)"}…`,
        );
      } else {
        pass(`kubernetes-real-repo needs ${expected}`);
      }
    }

    const k8sManifestModules = k8sRealGraph.nodes.filter(
      (node) =>
        node.kind === "module" &&
        node.metadata?.kubernetesModule === true &&
        /(?:^|\/)kubernetes-manifests\//i.test(
          String(node.metadata?.file ?? node.label).replaceAll("\\", "/"),
        ),
    );
    const k8sFrontendModule = k8sManifestModules.find((node) =>
      /frontend\.ya?ml$/i.test(
        String(node.metadata?.file ?? node.label).replaceAll("\\", "/"),
      ),
    );
    if (
      !k8sFrontendModule ||
      k8sFrontendModule.parentId !== k8sRealDeploy?.id ||
      k8sFrontendModule.metadata?.collapsedInOverview !== true
    ) {
      fail(
        `kubernetes-real-repo kubernetes-manifests/frontend.yaml should nest+collapse under Deploy, found parent=${k8sFrontendModule?.parentId ?? "(missing)"} collapsed=${k8sFrontendModule?.metadata?.collapsedInOverview}`,
      );
    } else {
      pass(
        "kubernetes-real-repo kubernetes-manifests/frontend.yaml nested+collapsed under Deploy",
      );
    }

    if (k8sManifestModules.length < 10) {
      fail(
        `kubernetes-real-repo expected ≥10 kubernetes-manifests modules, found ${k8sManifestModules.length}`,
      );
    } else {
      pass(
        `kubernetes-real-repo ${k8sManifestModules.length} kubernetes-manifests modules`,
      );
    }

    const k8sRealEvidenceGaps = k8sRealResources.filter((node) => {
      const detail = node.evidence?.[0]?.detail ?? "";
      return !/^kind:/.test(detail);
    });
    if (k8sRealEvidenceGaps.length > 0) {
      fail(
        `kubernetes-real-repo evidence should cite kind: ${k8sRealEvidenceGaps
          .map((node) => node.label)
          .slice(0, 8)
          .join(", ")}`,
      );
    } else {
      pass("kubernetes-real-repo evidence details cite kind:");
    }

    const k8sRealKmEvidence = k8sRealResources.filter((node) =>
      /(?:^|\/)kubernetes-manifests\//i.test(
        String(node.evidence?.[0]?.file ?? "").replaceAll("\\", "/"),
      ),
    );
    if (k8sRealKmEvidence.length < 20) {
      fail(
        `kubernetes-real-repo expected ≥20 resources from kubernetes-manifests/, found ${k8sRealKmEvidence.length}`,
      );
    } else {
      pass(
        `kubernetes-real-repo ${k8sRealKmEvidence.length} resources evidenced from kubernetes-manifests/`,
      );
    }

    const k8sRealCommerceNoise = k8sRealGraph.edges.some((edge) =>
      /checkout|orders?/i.test(
        `${edge.label ?? ""} ${JSON.stringify(edge.metadata ?? {})}`,
      ),
    );
    if (k8sRealCommerceNoise) {
      fail(
        "kubernetes-real-repo should not inherit Checkout/orders commerce collaboration copy",
      );
    } else {
      pass(
        "kubernetes-real-repo has no Checkout/orders commerce collaboration noise",
      );
    }

    // Helm extractor must stay honest on Boutique: Chart.yaml is real product
    // surface, but `{{ .Values… }}` names must never become Deploy units
    // (fullname helpers may resolve on other charts — Values stay skipped).
    const boutiqueHelmResources = k8sRealGraph.nodes.filter(
      (node) => node.metadata?.helmResource === true,
    );
    const boutiqueHelmTemplateChrome = boutiqueHelmResources.filter((node) =>
      /\{\{/.test(
        `${node.label ?? ""} ${node.metadata?.resourceName ?? ""} ${node.metadata?.address ?? ""}`,
      ),
    );
    if (boutiqueHelmTemplateChrome.length > 0) {
      fail(
        `kubernetes-real-repo helm extractor should skip {{ .Values }} names; found ${boutiqueHelmTemplateChrome
          .map((node) => node.label)
          .slice(0, 8)
          .join(", ")}`,
      );
    } else {
      pass(
        "kubernetes-real-repo helm extractor skips {{ .Values }} template resource names",
      );
    }
    if (boutiqueHelmResources.length > 0) {
      fail(
        `kubernetes-real-repo expected 0 concrete helm template resources (all names are {{ .Values }}), found ${boutiqueHelmResources.length}`,
      );
    } else {
      pass("kubernetes-real-repo has no concrete helm template resources");
    }
    const boutiqueHelmChart = k8sRealGraph.nodes.find(
      (node) =>
        node.metadata?.helmChart === true &&
        node.metadata?.chartName === "onlineboutique",
    );
    if (!boutiqueHelmChart) {
      fail(
        "kubernetes-real-repo expected Helm Chart/onlineboutique from helm-chart/Chart.yaml",
      );
    } else if (
      boutiqueHelmChart.metadata?.exampleChrome !== true ||
      boutiqueHelmChart.metadata?.helmChartOnlyChrome !== true ||
      boutiqueHelmChart.metadata?.collapsedInOverview !== true
    ) {
      fail(
        `kubernetes-real-repo Chart/onlineboutique should quiet as Chart-only chrome beside kubernetes-manifests; found exampleChrome=${boutiqueHelmChart.metadata?.exampleChrome} helmChartOnlyChrome=${boutiqueHelmChart.metadata?.helmChartOnlyChrome} collapsed=${boutiqueHelmChart.metadata?.collapsedInOverview}`,
      );
    } else {
      pass(
        "kubernetes-real-repo Chart/onlineboutique quieted as Chart-only chrome beside kubernetes-manifests",
      );
    }

    const boutiqueHelmChartModule = k8sRealGraph.nodes.find(
      (node) =>
        node.kind === "module" &&
        node.metadata?.helm === true &&
        node.metadata?.chartName === "onlineboutique" &&
        /Chart\.yaml$/i.test(
          String(node.evidence?.[0]?.file ?? node.metadata?.file ?? "").replaceAll(
            "\\",
            "/",
          ),
        ),
    );
    if (
      boutiqueHelmChartModule &&
      boutiqueHelmChartModule.metadata?.exampleChrome !== true
    ) {
      fail(
        "kubernetes-real-repo helm-chart/Chart.yaml module should quiet as Chart-only chrome",
      );
    } else if (boutiqueHelmChartModule) {
      pass(
        "kubernetes-real-repo helm-chart/Chart.yaml module quieted as Chart-only chrome",
      );
    }

    // Concrete Helm charts (mini-helm / helm-examples) must NOT inherit this
    // quiet — only Values-only charts beside kubernetes-manifests.
    const boutiqueConcreteHelmKept = k8sRealGraph.nodes.filter(
      (node) =>
        node.metadata?.helmResource === true &&
        node.metadata?.exampleChrome === true,
    );
    if (boutiqueConcreteHelmKept.length > 0) {
      fail(
        "kubernetes-real-repo should not mark concrete helmResources as Chart-only chrome",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Capability ladder rung 10 prep: Helm charts extractor + mini-helm smoke.
// ---------------------------------------------------------------------------
const miniHelmGraph = await compileRepository(miniHelmRoot);
const miniHelmServices = miniHelmGraph.nodes.filter(
  (node) => node.kind === "service" && node.metadata?.helm === true,
);
const miniHelmServiceLabels = miniHelmServices.map((node) => node.label);
console.log(
  `Mini-helm graph: ${miniHelmGraph.nodes.length} nodes, ${miniHelmGraph.edges.length} edges → services ${[...new Set(miniHelmServiceLabels)].sort().join(", ")}`,
);

const miniHelmProduct = miniHelmGraph.nodes.find((node) => node.kind === "product");
if (!miniHelmProduct || miniHelmProduct.label !== "Mini Helm notes") {
  fail(
    `mini-helm product label expected 'Mini Helm notes', found '${miniHelmProduct?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-helm product labeled Mini Helm notes");
}

const miniHelmExtractors = miniHelmGraph.extractors.map((item) => item.id);
if (!miniHelmExtractors.includes("helm")) {
  fail(
    `mini-helm graph.extractors missing helm; found ${JSON.stringify(miniHelmExtractors)}`,
  );
} else {
  pass("mini-helm registers helm extractor");
}

const miniHelmChart = miniHelmServices.find(
  (node) => node.metadata?.helmChart === true,
);
if (
  !miniHelmChart ||
  miniHelmChart.metadata?.chartName !== "notes" ||
  miniHelmChart.label !== "Notes · Chart"
) {
  fail(
    `mini-helm missing Notes · Chart; found chartName=${miniHelmChart?.metadata?.chartName ?? "(missing)"} label=${miniHelmChart?.label ?? "(missing)"}`,
  );
} else if (
  miniHelmChart.metadata?.exampleChrome === true ||
  miniHelmChart.metadata?.helmChartOnlyChrome === true
) {
  fail(
    "mini-helm Notes · Chart with concrete templates must not quiet as Chart-only chrome",
  );
} else {
  pass("mini-helm has Notes · Chart from Chart.yaml");
}

const miniHelmResources = miniHelmServices.filter(
  (node) => node.metadata?.helmResource === true,
);
const miniHelmAddresses = new Set(
  miniHelmResources.map((node) => node.metadata?.address),
);
for (const expected of [
  "Deployment/api",
  "Service/api",
  "Deployment/web",
  "Ingress/notes",
]) {
  if (!miniHelmAddresses.has(expected)) {
    fail(
      `mini-helm missing resource ${expected}; found ${[...miniHelmAddresses].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-helm has resource ${expected}`);
  }
}

for (const expected of [
  "API · Deployment",
  "API · Service",
  "Web · Deployment",
  "Notes · notes.example.com",
]) {
  if (!miniHelmServiceLabels.includes(expected)) {
    fail(
      `mini-helm missing humanized service label ${expected}; found ${miniHelmServiceLabels.join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-helm service label ${expected}`);
  }
}

const miniHelmNeedsEdges = miniHelmGraph.edges.filter(
  (edge) =>
    edge.kind === "depends-on" &&
    edge.label === "needs" &&
    miniHelmServices.some((node) => node.id === edge.source) &&
    miniHelmServices.some((node) => node.id === edge.target),
);
const miniHelmNeedsPairs = new Set(
  miniHelmNeedsEdges.map((edge) => {
    const from = miniHelmServices.find((node) => node.id === edge.source);
    const to = miniHelmServices.find((node) => node.id === edge.target);
    return `${from?.metadata?.k8sKind}/${from?.metadata?.resourceName}→${to?.metadata?.k8sKind}/${to?.metadata?.resourceName}`;
  }),
);
for (const expected of [
  "Service/api→Deployment/api",
  "Ingress/notes→Service/api",
]) {
  if (!miniHelmNeedsPairs.has(expected)) {
    fail(
      `mini-helm missing selector/backend needs edge ${expected}; found ${[...miniHelmNeedsPairs].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-helm needs ${expected}`);
  }
}

const miniHelmSemantic = miniHelmGraph.nodes.filter(
  (node) => node.metadata?.projection === "semantic",
);
const miniHelmByKey = new Map(
  miniHelmSemantic
    .filter((node) => typeof node.metadata?.systemKey === "string")
    .map((node) => [node.metadata.systemKey, node]),
);
const miniHelmDeploy = miniHelmByKey.get("deploy");
if (!miniHelmDeploy || miniHelmDeploy.label !== "Charts") {
  fail(
    `mini-helm Deploy label expected 'Charts' from README, found '${miniHelmDeploy?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-helm Deploy labeled Charts");
}

const nestedHelmServices = miniHelmServices.filter(
  (node) => node.parentId === miniHelmDeploy?.id,
);
if (nestedHelmServices.length < 5) {
  fail(
    `mini-helm expected ≥5 helm units (chart + 4 resources) nested under Charts, found ${nestedHelmServices.length}`,
  );
} else {
  pass(`mini-helm ${nestedHelmServices.length} units nested under Charts`);
}

const miniHelmOverviewHubs = nestedHelmServices.filter(
  (node) =>
    node.metadata?.overviewHub === true &&
    node.metadata?.collapsedInOverview !== true &&
    node.metadata?.exampleChrome !== true,
);
if (miniHelmOverviewHubs.length < 5) {
  fail(
    `mini-helm overview should keep Chart/Deployments/Services/Ingress as hubs beside Charts, found ${miniHelmOverviewHubs
      .map((node) => node.label)
      .join(", ") || "(none)"}`,
  );
} else {
  pass(
    `mini-helm ${miniHelmOverviewHubs.length} Chart/resource hubs visible beside Charts`,
  );
}

const miniHelmFlow = miniHelmSemantic
  .filter((node) => typeof node.metadata?.flowOrder === "number")
  .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
if (
  miniHelmFlow.length !== 1 ||
  miniHelmFlow[0]?.metadata?.systemKey !== "deploy"
) {
  fail(
    `mini-helm flowOrder expected Charts/Deploy, got ${miniHelmFlow.map((node) => node.label).join(" → ") || "(none)"}`,
  );
} else {
  pass(
    `mini-helm flowOrder: ${miniHelmFlow.map((node) => node.label).join(" → ")}`,
  );
}

const miniHelmModules = miniHelmGraph.nodes.filter(
  (node) => node.kind === "module" && node.metadata?.helmModule === true,
);
const miniHelmChartModule = miniHelmModules.find((node) =>
  /(?:^|\/)charts\/notes\/Chart\.ya?ml$/i.test(
    String(node.metadata?.file ?? node.label).replaceAll("\\", "/"),
  ),
);
if (
  !miniHelmChartModule ||
  miniHelmChartModule.parentId !== miniHelmDeploy?.id ||
  miniHelmChartModule.metadata?.exampleChrome !== true ||
  miniHelmChartModule.metadata?.helmModuleTwinChrome !== true
) {
  fail(
    `mini-helm charts/notes/Chart.yaml should nest under Charts as Chart twin chrome; found parent=${miniHelmChartModule?.parentId ?? "(missing)"} exampleChrome=${miniHelmChartModule?.metadata?.exampleChrome} twin=${miniHelmChartModule?.metadata?.helmModuleTwinChrome}`,
  );
} else {
  pass("mini-helm charts/notes/Chart.yaml quieted as Chart twin chrome");
}

const helmEvidenceGaps = miniHelmResources.filter((node) => {
  const detail = node.evidence?.[0]?.detail ?? "";
  return !/^kind:/.test(detail);
});
if (helmEvidenceGaps.length > 0) {
  fail(
    `mini-helm evidence should cite kind: ${helmEvidenceGaps
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-helm evidence details cite kind:");
}

const helmTemplateChrome = miniHelmServices.filter((node) =>
  /\{\{/.test(
    `${node.label ?? ""} ${node.metadata?.resourceName ?? ""} ${node.metadata?.address ?? ""}`,
  ),
);
if (helmTemplateChrome.length > 0) {
  fail(
    `mini-helm should not surface {{ template chrome; found ${helmTemplateChrome
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-helm has no {{ template chrome");
}

const helmCommerceNoise = miniHelmGraph.edges.some((edge) =>
  /checkout|orders?/i.test(
    `${edge.label ?? ""} ${JSON.stringify(edge.metadata ?? {})}`,
  ),
);
if (helmCommerceNoise) {
  fail(
    "mini-helm should not inherit Checkout/orders commerce collaboration copy",
  );
} else {
  pass("mini-helm has no Checkout/orders commerce collaboration noise");
}

// ---------------------------------------------------------------------------
// Capability ladder rung 10: real Helm-chart repo (pinned SHA, gitignored).
// Golden-lock helm/examples hello-world Deploy story (fullname-resolved names).
// ---------------------------------------------------------------------------
let helmRealRoot;
try {
  helmRealRoot = await ensureRealRepo(HELM_EXAMPLES);
  pass(
    `helm real repo ${HELM_EXAMPLES.name} ready @ ${HELM_EXAMPLES.sha.slice(0, 12)}`,
  );
} catch (error) {
  fail(
    `could not ensure helm real repo ${HELM_EXAMPLES.name}@${HELM_EXAMPLES.sha}: ${error instanceof Error ? error.message : error}`,
  );
}

if (helmRealRoot) {
  let helmRealGraph;
  try {
    helmRealGraph = await compileRepository(helmRealRoot);
    pass(
      `helm-real-repo scan completed: ${helmRealGraph.nodes.length} nodes, ${helmRealGraph.edges.length} edges`,
    );
  } catch (error) {
    fail(
      `helm-real-repo scan crashed on ${HELM_EXAMPLES.name}: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (helmRealGraph) {
    const helmRealServices = helmRealGraph.nodes.filter(
      (node) => node.kind === "service" && node.metadata?.helm === true,
    );
    const helmRealResources = helmRealServices.filter(
      (node) => node.metadata?.helmResource === true,
    );
    const helmRealSemantic = helmRealGraph.nodes.filter(
      (node) => node.metadata?.projection === "semantic",
    );
    const helmRealProduct = helmRealGraph.nodes.find(
      (node) => node.kind === "product",
    );
    const helmRealByKey = new Map(
      helmRealSemantic
        .filter((node) => typeof node.metadata?.systemKey === "string")
        .map((node) => [node.metadata.systemKey, node]),
    );
    const helmRealDeploy = helmRealByKey.get("deploy");
    const helmRealAddresses = new Set(
      helmRealResources.map((node) => node.metadata?.address),
    );
    const helmRealLabels = new Set(helmRealServices.map((node) => node.label));

    const helmRealSummary = {
      pin: `${HELM_EXAMPLES.name}@${HELM_EXAMPLES.sha}`,
      product: helmRealProduct?.label ?? null,
      nodes: helmRealGraph.nodes.length,
      edges: helmRealGraph.edges.length,
      resources: helmRealResources.length,
      semantic: helmRealSemantic.map((node) => node.label),
      serviceLabels: [...helmRealLabels].sort(),
    };
    console.log(
      `Helm-real-repo scan summary: ${JSON.stringify(helmRealSummary)}`,
    );

    if (
      !helmRealProduct ||
      helmRealProduct.label !== "Helm Example Repository"
    ) {
      fail(
        `helm-real-repo product label expected 'Helm Example Repository', found '${helmRealProduct?.label ?? "(missing)"}'`,
      );
    } else {
      pass(`helm-real-repo product label: ${helmRealProduct.label}`);
    }

    if (!helmRealDeploy || helmRealDeploy.label !== "Deploy") {
      fail(
        `helm-real-repo deploy system label expected 'Deploy', found '${helmRealDeploy?.label ?? "(missing)"}'`,
      );
    } else {
      pass("helm-real-repo deploy system labeled 'Deploy'");
    }

    if (!helmRealGraph.extractors.some((item) => item.id === "helm")) {
      fail("helm-real-repo graph.extractors missing helm");
    } else {
      pass("helm-real-repo registers helm extractor");
    }

    const helmRealChart = helmRealServices.find(
      (node) =>
        node.metadata?.helmChart === true &&
        node.metadata?.chartName === "hello-world",
    );
    if (!helmRealChart || helmRealChart.label !== "Hello world · Chart") {
      fail(
        `helm-real-repo expected Hello world · Chart; found chartName=${helmRealChart?.metadata?.chartName ?? "(missing)"} label=${helmRealChart?.label ?? "(missing)"}`,
      );
    } else if (
      helmRealChart.metadata?.exampleChrome === true ||
      helmRealChart.metadata?.helmChartOnlyChrome === true
    ) {
      fail(
        "helm-real-repo Hello world · Chart with concrete templates must not quiet as Chart-only chrome",
      );
    } else {
      pass("helm-real-repo has Hello world · Chart from Chart.yaml");
    }

    if (helmRealResources.length < 2) {
      fail(
        `helm-real-repo expected ≥2 fullname-resolved helm resources, found ${helmRealResources.length}`,
      );
    } else {
      pass(
        `helm-real-repo ${helmRealResources.length} fullname-resolved helm resources`,
      );
    }

    for (const expected of ["Deployment/hello-world", "Service/hello-world"]) {
      if (!helmRealAddresses.has(expected)) {
        fail(
          `helm-real-repo missing resource ${expected}; found ${[...helmRealAddresses].join(", ") || "(none)"}`,
        );
      } else {
        pass(`helm-real-repo has resource ${expected}`);
      }
    }

    for (const expected of [
      "Hello world · Deployment",
      "Hello world · Service",
    ]) {
      if (!helmRealLabels.has(expected)) {
        fail(
          `helm-real-repo missing humanized service label ${expected}; found ${[...helmRealLabels].join(", ") || "(none)"}`,
        );
      } else {
        pass(`helm-real-repo service label ${expected}`);
      }
    }

    const valuesChrome = helmRealServices.filter((node) =>
      /\{\{|Values\b/.test(
        `${node.label ?? ""} ${node.metadata?.resourceName ?? ""} ${node.metadata?.address ?? ""}`,
      ),
    );
    if (valuesChrome.length > 0) {
      fail(
        `helm-real-repo should not surface {{ .Values }} chrome; found ${valuesChrome
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass("helm-real-repo has no {{ .Values }} chrome");
    }

    const nestedHelmUnits = helmRealServices.filter(
      (node) => node.parentId === helmRealDeploy?.id,
    );
    if (nestedHelmUnits.length < 3) {
      fail(
        `helm-real-repo expected ≥3 helm units (chart + deployment + service) nested under Deploy, found ${nestedHelmUnits.length}`,
      );
    } else {
      pass(
        `helm-real-repo ${nestedHelmUnits.length} units nested under Deploy`,
      );
    }

    // North-star cold-read: Deploy + Hello world Chart/Deployment/Service hubs
    // (not a bare Deploy box; not Chart.yaml module twin chrome).
    const helmRealOverviewHubs = nestedHelmUnits.filter(
      (node) =>
        node.metadata?.overviewHub === true &&
        node.metadata?.collapsedInOverview !== true &&
        node.metadata?.exampleChrome !== true,
    );
    const helmRealOverviewLabels = new Set(
      helmRealOverviewHubs.map((node) => node.label),
    );
    for (const expected of [
      "Hello world · Chart",
      "Hello world · Deployment",
      "Hello world · Service",
    ]) {
      if (!helmRealOverviewLabels.has(expected)) {
        fail(
          `helm-real-repo North-star overview missing hub ${expected}; found ${[...helmRealOverviewLabels].join(", ") || "(none)"}`,
        );
      } else {
        pass(`helm-real-repo overview hub ${expected}`);
      }
    }
    if (helmRealOverviewHubs.length !== 3) {
      fail(
        `helm-real-repo North-star overview expected exactly 3 Hello world hubs, found ${helmRealOverviewHubs.length}: ${[...helmRealOverviewLabels].join(", ")}`,
      );
    } else {
      pass("helm-real-repo North-star overview has exactly 3 Hello world hubs");
    }

    if (helmRealDeploy?.metadata?.collapsedInOverview === true) {
      fail("helm-real-repo Deploy should stay visible on overview");
    } else {
      pass("helm-real-repo Deploy stays visible on overview");
    }

    const helmRealFlow = helmRealSemantic
      .filter(
        (node) =>
          typeof node.metadata?.flowOrder === "number" &&
          node.metadata?.collapsedInOverview !== true,
      )
      .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
    if (
      helmRealFlow.length !== 1 ||
      helmRealFlow[0]?.metadata?.systemKey !== "deploy"
    ) {
      fail(
        `helm-real-repo flowOrder expected Deploy-only, got ${helmRealFlow.map((node) => node.label).join(" → ") || "(none)"}`,
      );
    } else {
      pass(
        `helm-real-repo flowOrder: ${helmRealFlow.map((node) => node.label).join(" → ")}`,
      );
    }

    const helmRealChartModule = helmRealGraph.nodes.find(
      (node) =>
        node.kind === "module" &&
        node.metadata?.helmModule === true &&
        node.metadata?.file === "charts/hello-world/Chart.yaml",
    );
    if (
      !helmRealChartModule ||
      helmRealChartModule.parentId !== helmRealDeploy?.id ||
      helmRealChartModule.metadata?.exampleChrome !== true ||
      helmRealChartModule.metadata?.helmModuleTwinChrome !== true
    ) {
      fail(
        `helm-real-repo charts/hello-world/Chart.yaml should nest under Deploy as Chart twin chrome; found parent=${helmRealChartModule?.parentId ?? "(missing)"} exampleChrome=${helmRealChartModule?.metadata?.exampleChrome} twin=${helmRealChartModule?.metadata?.helmModuleTwinChrome}`,
      );
    } else {
      pass(
        "helm-real-repo charts/hello-world/Chart.yaml quieted as Chart twin chrome",
      );
    }

    const helmRealTemplateTwins = helmRealGraph.nodes.filter(
      (node) =>
        node.kind === "module" &&
        node.metadata?.helmModule === true &&
        /templates\/(deployment|service)\.yaml$/i.test(
          String(node.metadata?.file ?? ""),
        ),
    );
    const helmRealTemplateTwinGaps = helmRealTemplateTwins.filter(
      (node) =>
        node.metadata?.exampleChrome !== true ||
        node.metadata?.helmModuleTwinChrome !== true,
    );
    if (
      helmRealTemplateTwins.length < 2 ||
      helmRealTemplateTwinGaps.length > 0
    ) {
      fail(
        `helm-real-repo template modules should quiet as twin chrome; found ${helmRealTemplateTwins
          .map(
            (node) =>
              `${node.metadata?.file}:chrome=${node.metadata?.exampleChrome}`,
          )
          .join(", ") || "(none)"}`,
      );
    } else {
      pass(
        `helm-real-repo ${helmRealTemplateTwins.length} template modules quieted as twin chrome`,
      );
    }

    const helmRealNeedsPairs = new Set(
      helmRealGraph.edges
        .filter(
          (edge) => edge.kind === "depends-on" && edge.label === "needs",
        )
        .map((edge) => {
          const source = helmRealServices.find(
            (node) => node.id === edge.source,
          );
          const target = helmRealServices.find(
            (node) => node.id === edge.target,
          );
          return `${source?.metadata?.k8sKind}/${source?.metadata?.resourceName}→${target?.metadata?.k8sKind}/${target?.metadata?.resourceName}`;
        }),
    );
    if (
      !helmRealNeedsPairs.has("Service/hello-world→Deployment/hello-world")
    ) {
      fail(
        `helm-real-repo missing same-name needs Service/hello-world→Deployment/hello-world; found ${[...helmRealNeedsPairs].join(", ") || "(none)"}`,
      );
    } else {
      pass(
        "helm-real-repo needs Service/hello-world→Deployment/hello-world (fullname scaffold)",
      );
    }

    const helmRealEvidenceGaps = helmRealResources.filter((node) => {
      const detail = node.evidence?.[0]?.detail ?? "";
      return !/kind:\s*Deployment|kind:\s*Service/.test(detail);
    });
    if (helmRealEvidenceGaps.length > 0) {
      fail(
        `helm-real-repo evidence should cite kind: ${helmRealEvidenceGaps
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass("helm-real-repo evidence details cite kind:");
    }

    const helmRealCommerceNoise = helmRealGraph.edges.some((edge) =>
      /checkout|orders?/i.test(
        `${edge.label ?? ""} ${JSON.stringify(edge.metadata ?? {})}`,
      ),
    );
    if (helmRealCommerceNoise) {
      fail(
        "helm-real-repo should not inherit Checkout/orders commerce collaboration copy",
      );
    } else {
      pass("helm-real-repo has no Checkout/orders commerce collaboration noise");
    }

    // Unique Hello world canvas labels — no Chart twin restating the story.
    const helmRealVisibleLabels = helmRealGraph.nodes
      .filter(
        (node) =>
          node.kind !== "product" &&
          node.metadata?.collapsedInOverview !== true &&
          node.metadata?.exampleChrome !== true,
      )
      .map((node) => node.label);
    const helmRealLabelCounts = new Map();
    for (const label of helmRealVisibleLabels) {
      helmRealLabelCounts.set(label, (helmRealLabelCounts.get(label) ?? 0) + 1);
    }
    const helmRealTwinLabels = [...helmRealLabelCounts.entries()].filter(
      ([, count]) => count > 1,
    );
    if (helmRealTwinLabels.length > 0) {
      fail(
        `helm-real-repo North-star overview has duplicate labels: ${helmRealTwinLabels
          .map(([label, count]) => `${label}×${count}`)
          .join(", ")}`,
      );
    } else {
      pass("helm-real-repo North-star overview has unique Hello world labels");
    }
  }
}

// ---------------------------------------------------------------------------
// Capability ladder rung 11 prep: Kustomize overlays extractor + mini-kustomize.
// ---------------------------------------------------------------------------
const miniKustomizeGraph = await compileRepository(miniKustomizeRoot);
const miniKustomizeOverlayServices = miniKustomizeGraph.nodes.filter(
  (node) => node.kind === "service" && node.metadata?.kustomize === true,
);
const miniKustomizeK8sServices = miniKustomizeGraph.nodes.filter(
  (node) => node.kind === "service" && node.metadata?.kubernetes === true,
);
const miniKustomizeServiceLabels = [
  ...miniKustomizeOverlayServices,
  ...miniKustomizeK8sServices,
].map((node) => node.label);
console.log(
  `Mini-kustomize graph: ${miniKustomizeGraph.nodes.length} nodes, ${miniKustomizeGraph.edges.length} edges → services ${[...new Set(miniKustomizeServiceLabels)].sort().join(", ")}`,
);

const miniKustomizeProduct = miniKustomizeGraph.nodes.find(
  (node) => node.kind === "product",
);
if (
  !miniKustomizeProduct ||
  miniKustomizeProduct.label !== "Mini Kustomize notes"
) {
  fail(
    `mini-kustomize product label expected 'Mini Kustomize notes', found '${miniKustomizeProduct?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-kustomize product labeled Mini Kustomize notes");
}

const miniKustomizeExtractors = miniKustomizeGraph.extractors.map(
  (item) => item.id,
);
if (!miniKustomizeExtractors.includes("kustomize")) {
  fail(
    `mini-kustomize graph.extractors missing kustomize; found ${JSON.stringify(miniKustomizeExtractors)}`,
  );
} else {
  pass("mini-kustomize registers kustomize extractor");
}

const miniKustomizeHubs = miniKustomizeOverlayServices.filter(
  (node) => node.metadata?.kustomization === true,
);
const miniKustomizeOverlay = miniKustomizeHubs.find(
  (node) =>
    node.metadata?.overlayName === "notes" &&
    node.metadata?.kustomizeRole === "overlay",
);
const miniKustomizeBaseLabels = new Set(
  miniKustomizeHubs
    .filter((node) => node.metadata?.kustomizeRole === "base")
    .map((node) => node.label),
);
if (
  !miniKustomizeOverlay ||
  miniKustomizeOverlay.label !== "Notes · Overlay"
) {
  fail(
    `mini-kustomize missing Notes · Overlay; found overlayName=${miniKustomizeOverlay?.metadata?.overlayName ?? "(missing)"} label=${miniKustomizeOverlay?.label ?? "(missing)"}`,
  );
} else if (
  miniKustomizeOverlay.metadata?.exampleChrome === true ||
  miniKustomizeOverlay.metadata?.overviewHub !== true
) {
  fail(
    `mini-kustomize Notes · Overlay should be an overview hub (not chrome); found exampleChrome=${miniKustomizeOverlay.metadata?.exampleChrome} overviewHub=${miniKustomizeOverlay.metadata?.overviewHub}`,
  );
} else {
  pass("mini-kustomize has Notes · Overlay hub from kustomization.yaml");
}
for (const expected of ["API · Base", "Web · Base"]) {
  if (!miniKustomizeBaseLabels.has(expected)) {
    fail(
      `mini-kustomize missing base hub ${expected}; found ${[...miniKustomizeBaseLabels].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-kustomize base hub ${expected}`);
  }
}

const miniKustomizeResources = miniKustomizeK8sServices.filter(
  (node) => node.metadata?.kubernetesResource === true,
);
const miniKustomizeAddresses = new Set(
  miniKustomizeResources.map((node) => node.metadata?.address),
);
for (const expected of [
  "Deployment/api",
  "Service/api",
  "Deployment/web",
  "Ingress/notes",
]) {
  if (!miniKustomizeAddresses.has(expected)) {
    fail(
      `mini-kustomize missing resource ${expected}; found ${[...miniKustomizeAddresses].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-kustomize has resource ${expected}`);
  }
}

for (const expected of [
  "API · Deployment",
  "API · Service",
  "Web · Deployment",
  "Notes · notes.example.com",
]) {
  if (!miniKustomizeServiceLabels.includes(expected)) {
    fail(
      `mini-kustomize missing humanized service label ${expected}; found ${miniKustomizeServiceLabels.join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-kustomize service label ${expected}`);
  }
}

const miniKustomizeNeedsEdges = miniKustomizeGraph.edges.filter(
  (edge) =>
    edge.kind === "depends-on" &&
    edge.label === "needs" &&
    miniKustomizeK8sServices.some((node) => node.id === edge.source) &&
    miniKustomizeK8sServices.some((node) => node.id === edge.target),
);
const miniKustomizeNeedsPairs = new Set(
  miniKustomizeNeedsEdges.map((edge) => {
    const from = miniKustomizeK8sServices.find(
      (node) => node.id === edge.source,
    );
    const to = miniKustomizeK8sServices.find((node) => node.id === edge.target);
    return `${from?.metadata?.k8sKind}/${from?.metadata?.resourceName}→${to?.metadata?.k8sKind}/${to?.metadata?.resourceName}`;
  }),
);
for (const expected of [
  "Service/api→Deployment/api",
  "Ingress/notes→Service/api",
]) {
  if (!miniKustomizeNeedsPairs.has(expected)) {
    fail(
      `mini-kustomize missing selector/backend needs edge ${expected}; found ${[...miniKustomizeNeedsPairs].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-kustomize needs ${expected}`);
  }
}

const miniKustomizeSemantic = miniKustomizeGraph.nodes.filter(
  (node) => node.metadata?.projection === "semantic",
);
const miniKustomizeByKey = new Map(
  miniKustomizeSemantic
    .filter((node) => typeof node.metadata?.systemKey === "string")
    .map((node) => [node.metadata.systemKey, node]),
);
const miniKustomizeDeploy = miniKustomizeByKey.get("deploy");
if (!miniKustomizeDeploy || miniKustomizeDeploy.label !== "Overlays") {
  fail(
    `mini-kustomize Deploy label expected 'Overlays' from README, found '${miniKustomizeDeploy?.label ?? "(missing)"}'`,
  );
} else {
  pass("mini-kustomize Deploy labeled Overlays");
}

// Base/Overlay hubs nest under Overlays; path-linked k8s nest under hubs.
const nestedKustomizeHubs = miniKustomizeOverlayServices.filter(
  (node) => node.parentId === miniKustomizeDeploy?.id,
);
if (nestedKustomizeHubs.length < 3) {
  fail(
    `mini-kustomize expected ≥3 Base/Overlay hubs nested under Overlays, found ${nestedKustomizeHubs.length}`,
  );
} else {
  pass(
    `mini-kustomize ${nestedKustomizeHubs.length} Base/Overlay hubs nested under Overlays`,
  );
}

const miniKustomizeApiBase = miniKustomizeHubs.find(
  (node) => node.label === "API · Base",
);
const miniKustomizeWebBase = miniKustomizeHubs.find(
  (node) => node.label === "Web · Base",
);
const miniKustomizeNotesOverlay = miniKustomizeHubs.find(
  (node) => node.label === "Notes · Overlay",
);
const miniKustomizeOwnedByHub = [
  ["Deployment/api", miniKustomizeApiBase],
  ["Service/api", miniKustomizeApiBase],
  ["Deployment/web", miniKustomizeWebBase],
  ["Ingress/notes", miniKustomizeNotesOverlay],
];
for (const [address, hub] of miniKustomizeOwnedByHub) {
  const resource = miniKustomizeResources.find(
    (node) => node.metadata?.address === address,
  );
  if (!resource || !hub || resource.parentId !== hub.id) {
    fail(
      `mini-kustomize ${address} should nest under ${hub?.label ?? "(missing hub)"}; found parent=${resource ? miniKustomizeGraph.nodes.find((node) => node.id === resource.parentId)?.label ?? resource.parentId : "(missing)"}`,
    );
  } else {
    pass(`mini-kustomize ${address} nested under ${hub.label}`);
  }
}

const miniKustomizeOverviewHubs = nestedKustomizeHubs.filter(
  (node) =>
    node.metadata?.overviewHub === true &&
    node.metadata?.collapsedInOverview !== true &&
    node.metadata?.exampleChrome !== true,
);
if (
  miniKustomizeOverviewHubs.length < 3 ||
  !miniKustomizeOverviewHubs.some(
    (node) => node.label === "Notes · Overlay",
  ) ||
  !miniKustomizeOverviewHubs.some((node) => node.label === "API · Base") ||
  !miniKustomizeOverviewHubs.some((node) => node.label === "Web · Base")
) {
  fail(
    `mini-kustomize overview should keep Notes · Overlay + API/Web · Base hubs beside Overlays, found ${miniKustomizeOverviewHubs
      .map((node) => node.label)
      .join(", ") || "(none)"}`,
  );
} else {
  pass(
    `mini-kustomize ${miniKustomizeOverviewHubs.length} Base/Overlay hub(s) visible beside Overlays`,
  );
}

// Env overlay → base needs from resources: ../../bases/api entries.
const miniKustomizeHubNeeds = miniKustomizeGraph.edges.filter(
  (edge) =>
    edge.kind === "depends-on" &&
    edge.label === "needs" &&
    miniKustomizeHubs.some((node) => node.id === edge.source) &&
    miniKustomizeHubs.some((node) => node.id === edge.target),
);
const miniKustomizeHubNeedsPairs = new Set(
  miniKustomizeHubNeeds.map((edge) => {
    const from = miniKustomizeHubs.find((node) => node.id === edge.source);
    const to = miniKustomizeHubs.find((node) => node.id === edge.target);
    return `${from?.label}→${to?.label}`;
  }),
);
for (const expected of [
  "Notes · Overlay→API · Base",
  "Notes · Overlay→Web · Base",
]) {
  if (!miniKustomizeHubNeedsPairs.has(expected)) {
    fail(
      `mini-kustomize missing overlay→base needs ${expected}; found ${[...miniKustomizeHubNeedsPairs].join(", ") || "(none)"}`,
    );
  } else {
    pass(`mini-kustomize overlay→base needs ${expected}`);
  }
}

if (
  !miniKustomizeNotesOverlay ||
  miniKustomizeNotesOverlay.metadata?.namePrefix !== "notes-" ||
  miniKustomizeNotesOverlay.metadata?.legacyBases !== true ||
  miniKustomizeNotesOverlay.metadata?.namespace !== "notes"
) {
  fail(
    `mini-kustomize Notes · Overlay should carry namePrefix=notes-, legacyBases, namespace=notes; found prefix=${miniKustomizeNotesOverlay?.metadata?.namePrefix} legacyBases=${miniKustomizeNotesOverlay?.metadata?.legacyBases} namespace=${miniKustomizeNotesOverlay?.metadata?.namespace}`,
  );
} else {
  pass(
    "mini-kustomize Notes · Overlay locks namePrefix + legacy bases: + namespace",
  );
}
const notesOverlayDetail = miniKustomizeNotesOverlay?.evidence?.[0]?.detail ?? "";
if (
  !/namePrefix:notes-/.test(notesOverlayDetail) ||
  !/\blegacyBases\b/.test(notesOverlayDetail)
) {
  fail(
    `mini-kustomize Notes · Overlay evidence should cite namePrefix + legacyBases; found '${notesOverlayDetail}'`,
  );
} else {
  pass("mini-kustomize Notes · Overlay evidence cites namePrefix + legacyBases");
}

const miniKustomizeOverviewLeaves = miniKustomizeResources.filter(
  (node) =>
    node.metadata?.collapsedInOverview !== true &&
    node.metadata?.exampleChrome !== true,
);
if (miniKustomizeOverviewLeaves.length > 0) {
  fail(
    `mini-kustomize overview should collapse Deployments/Services/Ingress under Base/Overlay hubs, still visible: ${miniKustomizeOverviewLeaves
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-kustomize overview collapses resources under Base/Overlay hubs");
}

const miniKustomizeFlow = miniKustomizeSemantic
  .filter((node) => typeof node.metadata?.flowOrder === "number")
  .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
if (
  miniKustomizeFlow.length !== 1 ||
  miniKustomizeFlow[0]?.metadata?.systemKey !== "deploy"
) {
  fail(
    `mini-kustomize flowOrder expected Overlays/Deploy, got ${miniKustomizeFlow.map((node) => node.label).join(" → ") || "(none)"}`,
  );
} else {
  pass(
    `mini-kustomize flowOrder: ${miniKustomizeFlow.map((node) => node.label).join(" → ")}`,
  );
}

const miniKustomizeModules = miniKustomizeGraph.nodes.filter(
  (node) => node.kind === "module" && node.metadata?.kustomizeModule === true,
);
const miniKustomizeOverlayModule = miniKustomizeModules.find((node) =>
  /(?:^|\/)kustomize\/overlays\/notes\/kustomization\.ya?ml$/i.test(
    String(node.metadata?.file ?? node.label).replaceAll("\\", "/"),
  ),
);
if (
  !miniKustomizeOverlayModule ||
  miniKustomizeOverlayModule.parentId !== miniKustomizeDeploy?.id ||
  miniKustomizeOverlayModule.metadata?.exampleChrome !== true ||
  miniKustomizeOverlayModule.metadata?.kustomizeModuleTwinChrome !== true
) {
  fail(
    `mini-kustomize kustomize/overlays/notes/kustomization.yaml should nest under Overlays as Overlay twin chrome; found parent=${miniKustomizeOverlayModule?.parentId ?? "(missing)"} exampleChrome=${miniKustomizeOverlayModule?.metadata?.exampleChrome} twin=${miniKustomizeOverlayModule?.metadata?.kustomizeModuleTwinChrome}`,
  );
} else {
  pass(
    "mini-kustomize kustomize/overlays/notes/kustomization.yaml quieted as Overlay twin chrome",
  );
}

const kustomizeEvidenceGaps = miniKustomizeHubs.filter((node) => {
  const detail = node.evidence?.[0]?.detail ?? "";
  if (node.metadata?.kustomizeRole === "base") {
    return !/^base:/.test(detail);
  }
  return !/^overlay:/.test(detail);
});
if (kustomizeEvidenceGaps.length > 0) {
  fail(
    `mini-kustomize hub evidence should cite base:/overlay: ${kustomizeEvidenceGaps
      .map((node) => node.label)
      .join(", ")}`,
  );
} else {
  pass("mini-kustomize hub evidence details cite base:/overlay:");
}

const kustomizeCommerceNoise = miniKustomizeGraph.edges.some((edge) =>
  /checkout|orders?/i.test(
    `${edge.label ?? ""} ${JSON.stringify(edge.metadata ?? {})}`,
  ),
);
if (kustomizeCommerceNoise) {
  fail(
    "mini-kustomize should not inherit Checkout/orders commerce collaboration copy",
  );
} else {
  pass("mini-kustomize has no Checkout/orders commerce collaboration noise");
}

// ---------------------------------------------------------------------------
// Capability ladder rung 11: real Kustomize-led repo (pinned SHA, gitignored).
// Golden-lock stefanprodan/podinfo Deploy/Overlays story (bases + env overlays).
// ---------------------------------------------------------------------------
let kustomizeRealRoot;
try {
  kustomizeRealRoot = await ensureRealRepo(PODINFO);
  pass(
    `kustomize real repo ${PODINFO.name} ready @ ${PODINFO.sha.slice(0, 12)}`,
  );
} catch (error) {
  fail(
    `could not ensure kustomize real repo ${PODINFO.name}@${PODINFO.sha}: ${error instanceof Error ? error.message : error}`,
  );
}

if (kustomizeRealRoot) {
  let kustomizeRealGraph;
  try {
    kustomizeRealGraph = await compileRepository(kustomizeRealRoot);
    pass(
      `kustomize-real-repo scan completed: ${kustomizeRealGraph.nodes.length} nodes, ${kustomizeRealGraph.edges.length} edges`,
    );
  } catch (error) {
    fail(
      `kustomize-real-repo scan crashed on ${PODINFO.name}: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (kustomizeRealGraph) {
    const kustomizeRealOverlays = kustomizeRealGraph.nodes.filter(
      (node) =>
        node.kind === "service" &&
        node.metadata?.kustomize === true &&
        node.metadata?.kustomization === true,
    );
    const kustomizeRealSemantic = kustomizeRealGraph.nodes.filter(
      (node) => node.metadata?.projection === "semantic",
    );
    const kustomizeRealProduct = kustomizeRealGraph.nodes.find(
      (node) => node.kind === "product",
    );
    const kustomizeRealByKey = new Map(
      kustomizeRealSemantic
        .filter((node) => typeof node.metadata?.systemKey === "string")
        .map((node) => [node.metadata.systemKey, node]),
    );
    const kustomizeRealDeploy = kustomizeRealByKey.get("deploy");
    const kustomizeRealLabels = new Set(
      kustomizeRealOverlays.map((node) => node.label),
    );

    const kustomizeRealSummary = {
      pin: `${PODINFO.name}@${PODINFO.sha}`,
      product: kustomizeRealProduct?.label ?? null,
      nodes: kustomizeRealGraph.nodes.length,
      edges: kustomizeRealGraph.edges.length,
      overlays: kustomizeRealOverlays.length,
      semantic: kustomizeRealSemantic.map((node) => node.label),
      overlayLabels: [...kustomizeRealLabels].sort(),
    };
    console.log(
      `Kustomize-real-repo scan summary: ${JSON.stringify(kustomizeRealSummary)}`,
    );

    if (!kustomizeRealProduct || kustomizeRealProduct.label !== "Podinfo") {
      fail(
        `kustomize-real-repo product label expected 'Podinfo' from README, found '${kustomizeRealProduct?.label ?? "(missing)"}'`,
      );
    } else {
      pass(`kustomize-real-repo product label: ${kustomizeRealProduct.label}`);
    }

    if (!kustomizeRealDeploy || kustomizeRealDeploy.label !== "Deploy") {
      fail(
        `kustomize-real-repo deploy system label expected 'Deploy', found '${kustomizeRealDeploy?.label ?? "(missing)"}'`,
      );
    } else {
      pass("kustomize-real-repo deploy system labeled 'Deploy'");
    }

    if (!kustomizeRealGraph.extractors.some((item) => item.id === "kustomize")) {
      fail("kustomize-real-repo graph.extractors missing kustomize");
    } else {
      pass("kustomize-real-repo registers kustomize extractor");
    }

    const expectedOverlayLabels = [
      "Backend · Base",
      "Cache · Base",
      "Database · Base",
      "Frontend · Base",
      "Dev · Overlay",
      "Production · Overlay",
      "Staging · Overlay",
    ];
    for (const expected of expectedOverlayLabels) {
      if (!kustomizeRealLabels.has(expected)) {
        fail(
          `kustomize-real-repo missing base/overlay hub ${expected}; found ${[...kustomizeRealLabels].join(", ") || "(none)"}`,
        );
      } else {
        pass(`kustomize-real-repo hub ${expected}`);
      }
    }

    const productOverlays = kustomizeRealOverlays.filter(
      (node) =>
        expectedOverlayLabels.includes(node.label) &&
        node.metadata?.exampleChrome !== true,
    );
    if (productOverlays.length !== expectedOverlayLabels.length) {
      fail(
        `kustomize-real-repo expected ${expectedOverlayLabels.length} non-chrome product base/overlay hubs, found ${productOverlays.length}`,
      );
    } else {
      pass(
        `kustomize-real-repo ${productOverlays.length} product base/overlay hubs stay non-chrome`,
      );
    }

    const nestedOverlayHubs = productOverlays.filter(
      (node) =>
        node.parentId === kustomizeRealDeploy?.id &&
        node.metadata?.overviewHub === true &&
        node.metadata?.collapsedInOverview !== true,
    );
    if (nestedOverlayHubs.length !== expectedOverlayLabels.length) {
      fail(
        `kustomize-real-repo expected ${expectedOverlayLabels.length} overview Base/Overlay hubs nested under Deploy, found ${nestedOverlayHubs.length}: ${nestedOverlayHubs
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass(
        `kustomize-real-repo ${nestedOverlayHubs.length} Base/Overlay hubs nested under Deploy as overview hubs`,
      );
    }

    // Env overlays need the shared bases (resources: ../../bases/backend …).
    const kustomizeHubNeeds = kustomizeRealGraph.edges.filter(
      (edge) =>
        edge.kind === "depends-on" &&
        edge.label === "needs" &&
        productOverlays.some((node) => node.id === edge.source) &&
        productOverlays.some((node) => node.id === edge.target),
    );
    const kustomizeHubNeedsPairs = new Set(
      kustomizeHubNeeds.map((edge) => {
        const from = productOverlays.find((node) => node.id === edge.source);
        const to = productOverlays.find((node) => node.id === edge.target);
        return `${from?.label}→${to?.label}`;
      }),
    );
    for (const env of ["Dev · Overlay", "Staging · Overlay", "Production · Overlay"]) {
      for (const base of [
        "Backend · Base",
        "Frontend · Base",
        "Cache · Base",
        "Database · Base",
      ]) {
        const expected = `${env}→${base}`;
        if (!kustomizeHubNeedsPairs.has(expected)) {
          fail(
            `kustomize-real-repo missing overlay→base needs ${expected}; found ${[...kustomizeHubNeedsPairs].join(", ") || "(none)"}`,
          );
        } else {
          pass(`kustomize-real-repo overlay→base needs ${expected}`);
        }
      }
    }

    // Env overlays should keep namespace metadata from kustomization.yaml.
    for (const [label, ns] of [
      ["Dev · Overlay", "dev"],
      ["Staging · Overlay", "staging"],
      ["Production · Overlay", "production"],
    ]) {
      const overlay = productOverlays.find((node) => node.label === label);
      if (!overlay || overlay.metadata?.namespace !== ns) {
        fail(
          `kustomize-real-repo ${label} namespace expected '${ns}', found '${overlay?.metadata?.namespace ?? "(missing)"}'`,
        );
      } else {
        pass(`kustomize-real-repo ${label} namespace=${ns}`);
      }
    }

    // Simple kustomize/ installer beside deploy/bases+overlays is chrome.
    const rootKustomizeChrome = kustomizeRealOverlays.find(
      (node) =>
        node.metadata?.overlayName === "kustomize" ||
        /(?:^|\/)kustomize\/kustomization\.ya?ml$/i.test(
          String(node.evidence?.[0]?.file ?? "").replaceAll("\\", "/"),
        ),
    );
    if (
      !rootKustomizeChrome ||
      rootKustomizeChrome.metadata?.exampleChrome !== true ||
      rootKustomizeChrome.metadata?.kustomizeChrome !== true
    ) {
      fail(
        `kustomize-real-repo expected kustomize/ Overlay quieted as chrome beside deploy/; found label=${rootKustomizeChrome?.label ?? "(missing)"} exampleChrome=${rootKustomizeChrome?.metadata?.exampleChrome} kustomizeChrome=${rootKustomizeChrome?.metadata?.kustomizeChrome}`,
      );
    } else {
      pass("kustomize-real-repo kustomize/ Overlay quieted as chrome");
    }

    const kustomizeRealK8s = kustomizeRealGraph.nodes.filter(
      (node) =>
        node.kind === "service" &&
        node.metadata?.kubernetesResource === true,
    );
    // Path-linked base ownership: Backend · Base owns its Deployment/Service.
    const kustomizeRealBackendBase = productOverlays.find(
      (node) => node.label === "Backend · Base",
    );
    const backendOwned = kustomizeRealK8s.filter(
      (node) => node.parentId === kustomizeRealBackendBase?.id,
    );
    const backendOwnedAddresses = new Set(
      backendOwned.map((node) => node.metadata?.address),
    );
    for (const expected of ["Deployment/backend", "Service/backend"]) {
      if (!backendOwnedAddresses.has(expected)) {
        fail(
          `kustomize-real-repo Backend · Base should own ${expected}; found ${[...backendOwnedAddresses].join(", ") || "(none)"} under hub`,
        );
      } else {
        pass(`kustomize-real-repo Backend · Base owns ${expected}`);
      }
    }

    const hubOwnedK8s = kustomizeRealK8s.filter((node) =>
      productOverlays.some((hub) => hub.id === node.parentId),
    );
    if (hubOwnedK8s.length < 14) {
      fail(
        `kustomize-real-repo expected ≥14 kubernetes resources nested under Base/Overlay hubs, found ${hubOwnedK8s.length}`,
      );
    } else {
      pass(
        `kustomize-real-repo ${hubOwnedK8s.length} kubernetes resources nested under Base/Overlay hubs`,
      );
    }

    // webapp/ + secure/ sit outside bases/overlays — still under Deploy.
    const deployOwnedK8s = kustomizeRealK8s.filter(
      (node) => node.parentId === kustomizeRealDeploy?.id,
    );
    if (deployOwnedK8s.length < 8) {
      fail(
        `kustomize-real-repo expected ≥8 kubernetes resources outside hubs still under Deploy, found ${deployOwnedK8s.length}`,
      );
    } else {
      pass(
        `kustomize-real-repo ${deployOwnedK8s.length} non-hub kubernetes resources nested under Deploy`,
      );
    }

    const visibleK8sLeaves = kustomizeRealK8s.filter(
      (node) =>
        node.metadata?.collapsedInOverview !== true &&
        node.metadata?.exampleChrome !== true &&
        node.metadata?.overviewHub !== true,
    );
    if (visibleK8sLeaves.length > 0) {
      fail(
        `kustomize-real-repo overview should collapse Deployments/Services under Base/Overlay hubs, still visible: ${visibleK8sLeaves
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass(
        "kustomize-real-repo overview collapses kubernetes resources under Base/Overlay hubs",
      );
    }

    const kustomizeRealFlow = kustomizeRealSemantic
      .filter((node) => typeof node.metadata?.flowOrder === "number")
      .sort((a, b) => a.metadata.flowOrder - b.metadata.flowOrder);
    // North-star overlay-led cold-read: Deploy only (OpenAPI HTTP API quieted).
    if (
      kustomizeRealFlow.length !== 1 ||
      kustomizeRealFlow[0]?.metadata?.systemKey !== "deploy"
    ) {
      fail(
        `kustomize-real-repo flowOrder expected Deploy-only, got ${kustomizeRealFlow.map((node) => node.label).join(" → ") || "(none)"}`,
      );
    } else {
      pass(
        `kustomize-real-repo flowOrder Deploy-only: ${kustomizeRealFlow.map((node) => node.label).join(" → ")}`,
      );
    }

    const kustomizeRealApi = kustomizeRealByKey.get("api");
    if (
      !kustomizeRealApi ||
      kustomizeRealApi.metadata?.collapsedInOverview !== true
    ) {
      fail(
        `kustomize-real-repo OpenAPI HTTP API should collapse beside Deploy/Overlays; found collapsed=${kustomizeRealApi?.metadata?.collapsedInOverview}`,
      );
    } else {
      pass("kustomize-real-repo OpenAPI HTTP API quieted beside Deploy/Overlays");
    }

    const helmBesideOverlays = kustomizeRealGraph.nodes.filter(
      (node) =>
        node.metadata?.helmChart === true ||
        node.metadata?.helmResource === true,
    );
    if (helmBesideOverlays.length < 3) {
      fail(
        `kustomize-real-repo expected Helm Chart/resources beside overlays to quiet, found ${helmBesideOverlays.length}`,
      );
    }
    const loudHelmHubs = helmBesideOverlays.filter(
      (node) =>
        node.metadata?.exampleChrome !== true ||
        node.metadata?.collapsedInOverview !== true ||
        node.metadata?.overviewHub === true,
    );
    if (loudHelmHubs.length > 0) {
      fail(
        `kustomize-real-repo Helm hubs should quiet beside Overlays, still loud: ${loudHelmHubs
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass(
        `kustomize-real-repo ${helmBesideOverlays.length} Helm Chart/resources quieted beside Overlays`,
      );
    }

    const overlayEvidenceGaps = productOverlays.filter((node) => {
      const detail = node.evidence?.[0]?.detail ?? "";
      if (node.metadata?.kustomizeRole === "base") {
        return !/^base:/.test(detail);
      }
      return !/^overlay:/.test(detail);
    });
    if (overlayEvidenceGaps.length > 0) {
      fail(
        `kustomize-real-repo hub evidence should cite base:/overlay: ${overlayEvidenceGaps
          .map((node) => node.label)
          .join(", ")}`,
      );
    } else {
      pass("kustomize-real-repo hub evidence details cite base:/overlay:");
    }

    const kustomizeRealCommerce = kustomizeRealGraph.edges.some((edge) =>
      /checkout|orders?/i.test(
        `${edge.label ?? ""} ${JSON.stringify(edge.metadata ?? {})}`,
      ),
    );
    if (kustomizeRealCommerce) {
      fail(
        "kustomize-real-repo should not inherit Checkout/orders commerce collaboration copy",
      );
    } else {
      pass(
        "kustomize-real-repo has no Checkout/orders commerce collaboration noise",
      );
    }
  }
}

if (process.exitCode) {
  console.error("Verification suite failed.");
  process.exit(process.exitCode);
}

console.log("Verification suite passed.");
