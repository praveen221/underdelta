import assert from "node:assert/strict";
import test from "node:test";

import { edgeFrom } from "../dist/graph.js";
import {
  httpRouteSubresourceKey,
  isClientApisOnlyHttpApi as projectClientApisOnly,
  projectSemanticArchitecture,
} from "../dist/project.js";
import {
  clusterWalkAncestors,
  isClusterWalkHub,
} from "../dist/projection/clusterWalk.js";
import {
  isClientApiFunction,
  isClientApisOnlyHttpApi,
  liftFePageStoryEdges,
} from "../dist/projection/feStories.js";
import {
  isSqlMigrationSchema,
  liftDataAccessStoryEdges,
  projectDataArchitecture,
} from "../dist/projection/data.js";
import { operationStoryLabel } from "../dist/projection/labels.js";
import { searchMatchScore } from "../dist/projection/searchRank.js";
import {
  humanizeDeployNodeLabel,
  projectDeployArchitecture,
} from "../dist/projection/deploy.js";
import {
  createHttpApiSystem,
  endpointFacet,
  projectHttpArchitecture,
} from "../dist/projection/http.js";
import {
  KIND_CLUSTER_THRESHOLD,
  kindClusterLabel,
  projectKindClusters,
} from "../dist/projection/kindClusters.js";
import {
  createScheduledWorkSystem,
  humanizeCronExpression,
  projectScheduledWork,
  scheduledWorkSourcesForHandler,
} from "../dist/projection/scheduledWork.js";

const evidence = {
  file: "app/dashboard/page.tsx",
  extractor: "typescript",
  certainty: "observed",
};

function node(id, kind, label, extras = {}) {
  return { id, kind, label, metadata: {}, evidence: [evidence], ...extras };
}

function pageApiGraph({ serverRoute = false, call = true } = {}) {
  const page = node("page", "page", "Dashboard", {
    metadata: { path: "/dashboard", routeMolecule: "page:/dashboard" },
  });
  const body = node("body", "component", "DashboardPage", { parentId: page.id });
  const api = node("api", "api", "HTTP API", { metadata: { systemKey: "api" } });
  const helperModule = node("apis-module", "module", "apis/listDashboard.ts", {
    parentId: api.id,
    qualifiedName: "apis/listDashboard.ts",
  });
  const helper = node("helper", "function", "listDashboard", {
    parentId: helperModule.id,
    evidence: [{ ...evidence, file: "apis/listDashboard.ts" }],
  });
  const route = node("route", "route", "GET /dashboard", { parentId: api.id });
  const nodes = new Map(
    [page, body, api, helperModule, helper, ...(serverRoute ? [route] : [])].map(
      (item) => [item.id, item],
    ),
  );
  const systems = new Map([
    ["api", api],
    ["page:/dashboard", node("dashboard-system", "system", "Dashboard")],
  ]);
  const edges = new Map();
  if (call) {
    const edge = edgeFrom("calls", body.id, helper.id, evidence);
    edges.set(edge.id, edge);
  }
  return { nodes, edges, systems, api, helper };
}

test("client apis helpers are recognized from their evidence path", () => {
  const { nodes, helper } = pageApiGraph();
  assert.equal(isClientApiFunction(helper, nodes), true);
});

test("client-only API systems are not mistaken for in-repository server APIs", () => {
  const { nodes, api } = pageApiGraph();
  assert.equal(isClientApisOnlyHttpApi(api, nodes), true);
});

test("project keeps the client-only API classifier in its public module API", () => {
  assert.equal(projectClientApisOnly, isClientApisOnlyHttpApi);
});

test("server route evidence prevents client-only API classification", () => {
  const { nodes, api } = pageApiGraph({ serverRoute: true });
  assert.equal(isClientApisOnlyHttpApi(api, nodes), false);
});

test("called client helpers lift one page-molecule API story edge", () => {
  const { nodes, edges, systems } = pageApiGraph();
  liftFePageStoryEdges(nodes, edges, systems);
  const lifted = [...edges.values()].filter(
    (edge) =>
      edge.kind === "reads" &&
      edge.source === "dashboard-system" &&
      edge.target === "api",
  );
  assert.equal(lifted.length, 1);
  assert.match(lifted[0].evidence[0].detail, /client apis module/);
});

test("an uncalled client helper creates no invented page-to-API edge", () => {
  const { nodes, edges, systems } = pageApiGraph({ call: false });
  liftFePageStoryEdges(nodes, edges, systems);
  assert.equal(
    [...edges.values()].some(
      (edge) => edge.source === "dashboard-system" && edge.target === "api",
    ),
    false,
  );
});

test("lifting is idempotent when the same policy runs twice", () => {
  const { nodes, edges, systems } = pageApiGraph();
  liftFePageStoryEdges(nodes, edges, systems);
  liftFePageStoryEdges(nodes, edges, systems);
  assert.equal(
    [...edges.values()].filter(
      (edge) => edge.source === "dashboard-system" && edge.target === "api",
    ).length,
    1,
  );
});

test("data projection unifies resources and lifts explicit query bindings", () => {
  const api = node("api-system", "api", "HTTP API", {
    metadata: { projection: "semantic", systemKey: "api" },
  });
  const data = node("data-system", "system", "Data access", {
    metadata: { projection: "semantic", systemKey: "data" },
  });
  const handler = node("handler", "function", "listNotes", {
    parentId: api.id,
  });
  const prisma = node("prisma-note", "table", "Note", {
    technology: "prisma",
    semantics: [{
      kind: "resource",
      resourceKind: "table",
      provider: "prisma",
    }],
  });
  const sql = node("sql-notes", "table", "notes", {
    technology: "sql",
    semantics: [{
      kind: "resource",
      resourceKind: "table",
      provider: "sql",
    }],
  });
  const nodes = new Map([api, data, handler, prisma, sql].map((item) => [item.id, item]));
  const query = edgeFrom("queries", handler.id, sql.id, evidence);
  const edges = new Map([[query.id, query]]);
  const systems = new Map([["api", api], ["data", data]]);

  projectDataArchitecture({
    nodes,
    edges,
    systems,
    attachToSystem(id, parentId) {
      nodes.get(id).parentId = parentId;
    },
  });
  liftDataAccessStoryEdges(nodes, edges, systems);

  const tables = [...nodes.values()].filter((item) => item.kind === "table");
  assert.equal(tables.length, 1);
  assert.equal(tables[0].label, "Note");
  assert.deepEqual(tables[0].metadata.sources, ["prisma", "sql"]);
  assert.ok(
    [...edges.values()].some(
      (edge) => edge.kind === "queries" && edge.source === api.id && edge.target === data.id,
    ),
  );
  assert.ok(
    [...edges.values()].some(
      (edge) => edge.kind === "queries" && edge.source === api.id && edge.target === tables[0].id,
    ),
  );
  const apiToNote = [...edges.values()].find(
    (edge) =>
      edge.kind === "queries" &&
      edge.source === api.id &&
      edge.target === tables[0].id,
  );
  assert.equal(apiToNote.label, "queries Note");
  assert.equal(apiToNote.metadata.operationStory, true);
});

test("SQL migration schemas omit from Intermediate when tables exist", () => {
  const data = node("data-system", "system", "Data access", {
    metadata: { projection: "semantic", systemKey: "data" },
  });
  const table = node("article", "table", "Article", {
    technology: "prisma",
    semantics: [{
      kind: "resource",
      resourceKind: "table",
      provider: "prisma",
    }],
  });
  const migration = node("mig", "schema", "prisma/migrations/1.sql", {
    technology: "sql",
    metadata: { role: "migration" },
  });
  const database = node("db", "database", "Prisma database", {
    technology: "prisma",
  });
  const nodes = new Map(
    [data, table, migration, database].map((item) => [item.id, item]),
  );
  const edges = new Map();
  const systems = new Map([["data", data]]);

  projectDataArchitecture({
    nodes,
    edges,
    systems,
    attachToSystem(id, parentId) {
      nodes.get(id).parentId = parentId;
    },
  });

  assert.equal(isSqlMigrationSchema(nodes.get(migration.id)), true);
  assert.equal(nodes.get(migration.id).metadata.intermediateOmitted, true);
  assert.equal(
    nodes.get(migration.id).metadata.intermediateOmitReason,
    "migration-lineage",
  );
  assert.equal(nodes.get(database.id).metadata.collapsedInOverview, true);
  assert.equal(nodes.get(database.id).metadata.intermediateOmitted, undefined);
});

test("Find User ranks the table above the same-label route group", () => {
  const table = searchMatchScore({
    query: "user",
    label: "User",
    kind: "table",
  });
  const group = searchMatchScore({
    query: "user",
    label: "User",
    kind: "system",
    routeGroup: true,
  });
  const users = searchMatchScore({
    query: "user",
    label: "Users",
    kind: "system",
    routeGroup: true,
  });
  assert.ok(table > group, "exact table must beat exact route group");
  assert.ok(group > users, "exact User group still ranks above Users prefix");
});

test("operation story labels say writes Article not createArticle", () => {
  assert.equal(operationStoryLabel("writes", "Article", "table"), "writes Article");
  assert.equal(operationStoryLabel("reads", "User", "table"), "reads User");
  assert.equal(operationStoryLabel("writes", "Data access", "system"), "writes");
});

function rangedEvidence(file, startLine, endLine = startLine) {
  return {
    file,
    extractor: "typescript",
    certainty: "observed",
    range: {
      startLine,
      startColumn: 0,
      endLine,
      endColumn: 1,
    },
  };
}

test("HTTP route in-range controller call lifts POST /articles writes Article", () => {
  const api = node("api", "api", "HTTP API", {
    metadata: { projection: "semantic", systemKey: "api" },
  });
  const data = node("data", "system", "Data access", {
    metadata: { projection: "semantic", systemKey: "data" },
  });
  const route = node("route", "route", "POST /articles", {
    parentId: api.id,
    semantics: [{
      kind: "endpoint",
      protocol: "http",
      method: "POST",
      path: "/articles",
      provider: "express",
      declaration: "code",
    }],
    evidence: [rangedEvidence("article.controller.ts", 71, 78)],
  });
  const create = node("create", "function", "createArticle", {
    parentId: api.id,
  });
  const article = node("article", "table", "Article", { parentId: data.id });
  const nodes = new Map(
    [api, data, route, create, article].map((item) => [item.id, item]),
  );
  const write = edgeFrom(
    "writes",
    create.id,
    article.id,
    rangedEvidence("article.service.ts", 40),
  );
  const call = edgeFrom(
    "calls",
    api.id,
    create.id,
    rangedEvidence("article.controller.ts", 73),
  );
  const edges = new Map([[write.id, write], [call.id, call]]);
  const systems = new Map([["api", api], ["data", data]]);

  liftDataAccessStoryEdges(nodes, edges, systems);

  const routeWrite = [...edges.values()].find(
    (edge) =>
      edge.kind === "writes" &&
      edge.source === route.id &&
      edge.target === article.id,
  );
  assert.ok(routeWrite, "expected POST /articles → writes Article");
  assert.equal(routeWrite.label, "writes Article");
  assert.equal(routeWrite.metadata.operationStory, true);
  const apiWrite = [...edges.values()].find(
    (edge) =>
      edge.kind === "writes" &&
      edge.source === api.id &&
      edge.target === article.id,
  );
  assert.ok(apiWrite);
  assert.equal(apiWrite.label, "writes Article");
});

test("HTTP route routes-to handler lifts writes table", () => {
  const api = node("api", "api", "HTTP API", {
    metadata: { projection: "semantic", systemKey: "api" },
  });
  const data = node("data", "system", "Data access", {
    metadata: { projection: "semantic", systemKey: "data" },
  });
  const route = node("route", "route", "POST /notes", { parentId: api.id });
  const handler = node("handler", "function", "createNote", { parentId: api.id });
  const note = node("note", "table", "Note", { parentId: data.id });
  const nodes = new Map(
    [api, data, route, handler, note].map((item) => [item.id, item]),
  );
  const write = edgeFrom("writes", handler.id, note.id, evidence);
  const bind = edgeFrom("routes-to", route.id, handler.id, evidence);
  const edges = new Map([[write.id, write], [bind.id, bind]]);
  const systems = new Map([["api", api], ["data", data]]);

  liftDataAccessStoryEdges(nodes, edges, systems);

  assert.ok(
    [...edges.values()].some(
      (edge) =>
        edge.kind === "writes" &&
        edge.source === route.id &&
        edge.target === note.id &&
        edge.label === "writes Note",
    ),
  );
});

test("controller call outside the route span does not bind the operation", () => {
  const api = node("api", "api", "HTTP API", {
    metadata: { projection: "semantic", systemKey: "api" },
  });
  const data = node("data", "system", "Data access", {
    metadata: { projection: "semantic", systemKey: "data" },
  });
  const route = node("route", "route", "POST /articles", {
    parentId: api.id,
    evidence: [rangedEvidence("article.controller.ts", 71, 78)],
  });
  const other = node("other", "function", "addComment", { parentId: api.id });
  const comment = node("comment", "table", "Comment", { parentId: data.id });
  const nodes = new Map(
    [api, data, route, other, comment].map((item) => [item.id, item]),
  );
  const write = edgeFrom("writes", other.id, comment.id, evidence);
  const call = edgeFrom(
    "calls",
    api.id,
    other.id,
    rangedEvidence("article.controller.ts", 175),
  );
  const edges = new Map([[write.id, write], [call.id, call]]);
  const systems = new Map([["api", api], ["data", data]]);

  liftDataAccessStoryEdges(nodes, edges, systems);

  assert.equal(
    [...edges.values()].some(
      (edge) => edge.source === route.id && edge.target === comment.id,
    ),
    false,
    "out-of-range controller call must not invent POST /articles → Comment",
  );
});

test("scheduled-work projection creates calm labels and preserves the handler chain", () => {
  const trigger = node("trigger", "cron", "digest trigger", {
    semantics: [{
      kind: "trigger",
      triggerKind: "cron",
      provider: "node-cron",
      expression: "0 * * * *",
      timezone: "UTC",
      declaration: "code",
    }],
  });
  const job = node("job", "job", "send_digest", {
    semantics: [{
      kind: "job",
      executionKind: "in-process",
      provider: "node-cron",
      handler: "send_digest",
    }],
  });
  const handler = node("handler", "function", "send_digest");
  const jobs = createScheduledWorkSystem(evidence);
  const nodes = new Map([trigger, job, handler, jobs].map((item) => [item.id, item]));
  const edges = new Map();
  for (const edge of [
    edgeFrom("schedules", trigger.id, job.id, evidence),
    edgeFrom("handled-by", job.id, handler.id, evidence),
  ]) {
    edges.set(edge.id, edge);
  }

  projectScheduledWork({
    nodes,
    edges,
    jobsSystem: jobs,
    attach(id, parentId) {
      nodes.get(id).parentId = parentId;
    },
    humanizeIdentifier(label) {
      return label.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
    },
  });

  assert.equal(trigger.label, "Send digest (every hour)");
  assert.equal(job.label, "Send digest");
  assert.equal(trigger.parentId, jobs.id);
  assert.equal(job.parentId, jobs.id);
  assert.deepEqual(scheduledWorkSourcesForHandler(handler.id, edges.values()), [
    trigger.id,
  ]);
});

test("HTTP projection creates one API system and attaches typed endpoints", () => {
  const api = createHttpApiSystem(evidence);
  const route = node("route", "route", "legacy label", {
    semantics: [{
      kind: "endpoint",
      protocol: "http",
      method: "GET",
      path: "/notes",
      provider: "express",
      declaration: "code",
    }],
  });
  const unrelated = node("module", "module", "src/worker.ts");
  const nodes = new Map([api, route, unrelated].map((item) => [item.id, item]));
  const attached = [];
  projectHttpArchitecture({
    nodes,
    apiSystem: api,
    attach(nodeId, systemId) {
      attached.push([nodeId, systemId]);
      nodes.get(nodeId).parentId = systemId;
    },
  });
  assert.equal(endpointFacet(nodes.get(route.id)).provider, "express");
  assert.equal(nodes.get(route.id).label, "GET /notes");
  assert.deepEqual(attached, [[route.id, api.id]]);
  assert.equal(nodes.get(unrelated.id).parentId, undefined);
});

test("deploy projection attaches only typed units and derives calm labels", () => {
  const deploy = node("deploy", "system", "Deploy", {
    metadata: { projection: "semantic", systemKey: "deploy" },
  });
  const service = node("service", "service", "api", {
    semantics: [{
      kind: "deploy-unit",
      deployKind: "container",
      provider: "docker-compose",
      nativeKind: "Compose service",
      name: "api",
      image: "example/api:1",
      ports: ["8080:80"],
    }],
    metadata: { hostPorts: ["8080"] },
  });
  const decoy = node("decoy", "service", "legacy metadata", {
    metadata: { docker: true, serviceName: "decoy" },
  });
  const nodes = new Map([deploy, service, decoy].map((item) => [item.id, item]));

  projectDeployArchitecture({
    nodes,
    deploySystem: deploy,
    attach(id, parentId) {
      nodes.get(id).parentId = parentId;
    },
  });

  assert.equal(service.parentId, deploy.id);
  assert.equal(decoy.parentId, undefined);
  assert.equal(humanizeDeployNodeLabel(service), "API · 8080");
});

test("six-field cron expressions produce useful second-level labels", () => {
  assert.equal(humanizeCronExpression("*/5 * * * * *"), "every 5 seconds");
  assert.equal(humanizeCronExpression("0 0 * * * *"), "every hour");
});

function attachParent(nodes, edges) {
  return (nodeId, systemId, itemEvidence) => {
    const child = nodes.get(nodeId);
    if (!child) return;
    if (child.metadata?.projection === "semantic") return;
    child.parentId = systemId;
    nodes.set(nodeId, child);
    const contains = edgeFrom(
      "contains",
      systemId,
      nodeId,
      itemEvidence ?? evidence,
    );
    edges.set(contains.id, contains);
  };
}

test("kind cluster label names HTTP endpoints with the member count", () => {
  assert.equal(kindClusterLabel("route", 47), "HTTP endpoints (47)");
  assert.equal(kindClusterLabel("table", 15), "Tables (15)");
  assert.equal(kindClusterLabel("service", 135), "Services (135)");
  assert.equal(KIND_CLUSTER_THRESHOLD, 10);
});

test("more than 10 deploy services collapse to a Services hub", () => {
  const deploy = node("deploy", "system", "Deploy", {
    metadata: { projection: "semantic", systemKey: "deploy" },
  });
  const services = Array.from({ length: 11 }, (_, index) =>
    node(`svc-${index}`, "service", `Workload ${index}`, {
      parentId: deploy.id,
    }),
  );
  const nodes = new Map([deploy, ...services].map((item) => [item.id, item]));
  const edges = new Map();
  projectKindClusters({ nodes, edges, attach: attachParent(nodes, edges) });

  const hub = [...nodes.values()].find((item) => item.metadata?.kindCluster === true);
  assert.ok(hub, "expected a Services kind-cluster hub");
  assert.equal(hub.label, "Services (11)");
  assert.equal(hub.metadata.clusterKind, "service");
  assert.equal(hub.parentId, deploy.id);
  for (const item of services) {
    assert.equal(nodes.get(item.id).parentId, hub.id);
  }
});

test("more than 10 same-kind siblings collapse to a projection hub", () => {
  const api = node("api", "api", "HTTP API", {
    metadata: { projection: "semantic", systemKey: "api" },
  });
  const routes = Array.from({ length: 11 }, (_, index) =>
    node(`route-${index}`, "route", `GET /r${index}`, {
      parentId: api.id,
      metadata: { method: "GET", path: `/r${index}` },
    }),
  );
  const nodes = new Map([api, ...routes].map((item) => [item.id, item]));
  const edges = new Map();
  projectKindClusters({ nodes, edges, attach: attachParent(nodes, edges) });

  const hub = [...nodes.values()].find((item) => item.metadata?.kindCluster === true);
  assert.ok(hub, "expected a kind-cluster hub");
  assert.equal(hub.label, "HTTP endpoints (11)");
  assert.equal(hub.metadata.projection, "semantic");
  assert.equal(hub.metadata.clusterKind, "route");
  assert.equal(hub.metadata.memberCount, 11);
  assert.equal(hub.parentId, api.id);
  for (const route of routes) {
    assert.equal(nodes.get(route.id).parentId, hub.id);
    assert.equal(nodes.get(route.id).metadata.kindClusterMember, true);
    assert.ok(
      nodes.get(route.id).evidence.length >= 1,
      "member evidence must survive re-parent",
    );
  }
  assert.equal(
    [...nodes.values()].filter((item) => item.parentId === api.id && item.kind === "route")
      .length,
    0,
    "API must not keep 11 naked route peers",
  );
});

test("10 same-kind siblings stay naked — no fake cluster", () => {
  const api = node("api", "api", "HTTP API", {
    metadata: { projection: "semantic", systemKey: "api" },
  });
  const routes = Array.from({ length: 10 }, (_, index) =>
    node(`route-${index}`, "route", `GET /r${index}`, {
      parentId: api.id,
      metadata: { method: "GET", path: `/r${index}` },
    }),
  );
  const nodes = new Map([api, ...routes].map((item) => [item.id, item]));
  const edges = new Map();
  projectKindClusters({ nodes, edges, attach: attachParent(nodes, edges) });

  assert.equal(
    [...nodes.values()].some((item) => item.metadata?.kindCluster === true),
    false,
  );
  for (const route of routes) {
    assert.equal(nodes.get(route.id).parentId, api.id);
  }
});

test("kind clusters do not wrap members of an existing domain route group", () => {
  const api = node("api", "api", "HTTP API", {
    metadata: { projection: "semantic", systemKey: "api" },
  });
  const articles = node("articles", "system", "Articles", {
    parentId: api.id,
    metadata: {
      projection: "semantic",
      routeGroup: true,
      systemKey: "routes:articles",
    },
  });
  const routes = Array.from({ length: 11 }, (_, index) =>
    node(`route-${index}`, "route", `GET /articles/${index}`, {
      parentId: articles.id,
      metadata: { method: "GET", path: `/articles/${index}` },
    }),
  );
  const nodes = new Map(
    [api, articles, ...routes].map((item) => [item.id, item]),
  );
  const edges = new Map();
  projectKindClusters({ nodes, edges, attach: attachParent(nodes, edges) });

  assert.equal(
    [...nodes.values()].some((item) => item.metadata?.kindCluster === true),
    false,
    "Articles is already the cluster — do not nest HTTP endpoints (11)",
  );
  for (const route of routes) {
    assert.equal(nodes.get(route.id).parentId, articles.id);
  }
});

test("kind clusters skip modules and other semantic hubs", () => {
  const api = node("api", "api", "HTTP API", {
    metadata: { projection: "semantic", systemKey: "api" },
  });
  const modules = Array.from({ length: 12 }, (_, index) =>
    node(`mod-${index}`, "module", `src/r${index}.ts`, { parentId: api.id }),
  );
  const group = node("articles", "system", "Articles", {
    parentId: api.id,
    metadata: { projection: "semantic", routeGroup: true, systemKey: "routes:articles" },
  });
  const nodes = new Map([api, group, ...modules].map((item) => [item.id, item]));
  const edges = new Map();
  projectKindClusters({ nodes, edges, attach: attachParent(nodes, edges) });

  assert.equal(
    [...nodes.values()].some((item) => item.metadata?.kindCluster === true),
    false,
    "modules and semantic groups must not become kind clusters",
  );
  assert.equal(nodes.get(group.id).parentId, api.id);
});

test("projection of 11 unique Express routes collapses under HTTP API", () => {
  const product = node("product", "product", "Demo");
  const routes = Array.from({ length: 11 }, (_, index) => {
    const path = `/thing${index}`;
    return node(`route-${index}`, "route", `legacy ${index}`, {
      semantics: [{
        kind: "endpoint",
        protocol: "http",
        method: "GET",
        path,
        provider: "express",
        declaration: "code",
      }],
      metadata: { method: "GET", path, framework: "express" },
    });
  });
  const graph = projectSemanticArchitecture({
    schemaVersion: "0.2",
    project: { name: "demo", root: "/demo" },
    generatedAt: new Date(0).toISOString(),
    extractors: [],
    adapters: [],
    nodes: [product, ...routes],
    edges: [],
    diagnostics: [],
  });
  const hub = graph.nodes.find((item) => item.metadata?.kindCluster === true);
  const api = graph.nodes.find((item) => item.metadata?.systemKey === "api");
  assert.ok(api, "expected HTTP API system");
  assert.ok(hub, "expected kind-cluster hub for 11 unique routes");
  assert.equal(hub.label, "HTTP endpoints (11)");
  assert.equal(hub.parentId, api.id);
  const nakedRoutes = graph.nodes.filter(
    (item) => item.kind === "route" && item.parentId === api.id,
  );
  assert.equal(nakedRoutes.length, 0);
  const clustered = graph.nodes.filter(
    (item) => item.kind === "route" && item.parentId === hub.id,
  );
  assert.equal(clustered.length, 11);
});

test("HTTP subresource keys peel comments/favorite/feed off a domain path", () => {
  assert.equal(httpRouteSubresourceKey("/articles/:slug/comments", "articles"), "comments");
  assert.equal(
    httpRouteSubresourceKey("/articles/:slug/comments/:id", "articles"),
    "comments",
  );
  assert.equal(httpRouteSubresourceKey("/articles/:slug/favorite", "articles"), "favorite");
  assert.equal(httpRouteSubresourceKey("/articles/feed", "articles"), "feed");
  assert.equal(httpRouteSubresourceKey("/articles/:slug", "articles"), null);
  assert.equal(httpRouteSubresourceKey("/articles", "articles"), null);
  assert.equal(
    httpRouteSubresourceKey("/api/articles/{slug}/comments", "articles"),
    "comments",
  );
  assert.equal(httpRouteSubresourceKey("/users/login", "users"), "login");
  assert.equal(httpRouteSubresourceKey("/profiles/:username", "profiles"), null);
});

function endpointRoute(id, method, path) {
  return node(id, "route", `${method} ${path}`, {
    semantics: [{
      kind: "endpoint",
      protocol: "http",
      method,
      path,
      provider: "express",
      declaration: "code",
    }],
    metadata: { method, path, framework: "express" },
  });
}

test("Articles with 11 RealWorld verbs peels Comments and Favorite, keeps CRUD naked", () => {
  const product = node("product", "product", "Demo");
  const routes = [
    endpointRoute("r-list", "GET", "/articles"),
    endpointRoute("r-create", "POST", "/articles"),
    endpointRoute("r-get", "GET", "/articles/:slug"),
    endpointRoute("r-put", "PUT", "/articles/:slug"),
    endpointRoute("r-del", "DELETE", "/articles/:slug"),
    endpointRoute("r-feed", "GET", "/articles/feed"),
    endpointRoute("r-cget", "GET", "/articles/:slug/comments"),
    endpointRoute("r-cpost", "POST", "/articles/:slug/comments"),
    endpointRoute("r-cdel", "DELETE", "/articles/:slug/comments/:id"),
    endpointRoute("r-fav", "POST", "/articles/:slug/favorite"),
    endpointRoute("r-unfav", "DELETE", "/articles/:slug/favorite"),
  ];
  const graph = projectSemanticArchitecture({
    schemaVersion: "0.2",
    project: { name: "demo", root: "/demo" },
    generatedAt: new Date(0).toISOString(),
    extractors: [],
    adapters: [],
    nodes: [product, ...routes],
    edges: [],
    diagnostics: [],
  });
  const articles = graph.nodes.find(
    (item) => item.metadata?.routeDomain === "articles" && !item.metadata?.routeGroupNested,
  );
  assert.ok(articles, "expected Articles domain group");
  const comments = graph.nodes.find(
    (item) => item.metadata?.routeSubresource === "comments" && item.metadata?.routeGroupNested,
  );
  const favorite = graph.nodes.find(
    (item) => item.metadata?.routeSubresource === "favorite" && item.metadata?.routeGroupNested,
  );
  const feedHub = graph.nodes.find(
    (item) => item.metadata?.routeSubresource === "feed" && item.kind === "system",
  );
  assert.ok(comments, "expected Comments nested group");
  assert.ok(favorite, "expected Favorite nested group");
  assert.equal(comments.parentId, articles.id);
  assert.equal(favorite.parentId, articles.id);
  assert.equal(comments.label, "Comments");
  assert.equal(favorite.label, "Favorite");
  assert.equal(feedHub, undefined, "singleton feed must stay a route, not a 1-endpoint hub");
  assert.equal(
    graph.nodes.filter((item) => item.kind === "route" && item.parentId === comments.id).length,
    3,
  );
  assert.equal(
    graph.nodes.filter((item) => item.kind === "route" && item.parentId === favorite.id).length,
    2,
  );
  const naked = graph.nodes
    .filter((item) => item.kind === "route" && item.parentId === articles.id)
    .map((item) => item.label)
    .sort();
  assert.deepEqual(naked, [
    "DELETE /articles/:slug",
    "GET /articles",
    "GET /articles/:slug",
    "GET /articles/feed",
    "POST /articles",
    "PUT /articles/:slug",
  ]);
  assert.equal(
    graph.nodes.some((item) => item.metadata?.kindCluster === true),
    false,
    "must not wrap Articles in HTTP endpoints (11)",
  );
});

test("small domain groups do not grow nested subresource hubs", () => {
  const product = node("product", "product", "Demo");
  const routes = [
    endpointRoute("p-get", "GET", "/profiles/:username"),
    endpointRoute("p-follow", "POST", "/profiles/:username/follow"),
    endpointRoute("p-unfollow", "DELETE", "/profiles/:username/follow"),
  ];
  const graph = projectSemanticArchitecture({
    schemaVersion: "0.2",
    project: { name: "demo", root: "/demo" },
    generatedAt: new Date(0).toISOString(),
    extractors: [],
    adapters: [],
    nodes: [product, ...routes],
    edges: [],
    diagnostics: [],
  });
  const profiles = graph.nodes.find((item) => item.metadata?.routeDomain === "profiles");
  assert.ok(profiles, "expected Profiles domain group");
  assert.equal(
    graph.nodes.some((item) => item.metadata?.routeGroupNested === true),
    false,
  );
  assert.equal(
    graph.nodes.filter((item) => item.kind === "route" && item.parentId === profiles.id).length,
    3,
  );
});

test("cluster walk ancestors seed API → Articles under Comments", () => {
  const product = node("product", "product", "Demo");
  const routes = [
    endpointRoute("r-list", "GET", "/articles"),
    endpointRoute("r-create", "POST", "/articles"),
    endpointRoute("r-get", "GET", "/articles/:slug"),
    endpointRoute("r-put", "PUT", "/articles/:slug"),
    endpointRoute("r-del", "DELETE", "/articles/:slug"),
    endpointRoute("r-feed", "GET", "/articles/feed"),
    endpointRoute("r-cget", "GET", "/articles/:slug/comments"),
    endpointRoute("r-cpost", "POST", "/articles/:slug/comments"),
    endpointRoute("r-cdel", "DELETE", "/articles/:slug/comments/:id"),
    endpointRoute("r-fav", "POST", "/articles/:slug/favorite"),
    endpointRoute("r-unfav", "DELETE", "/articles/:slug/favorite"),
  ];
  const graph = projectSemanticArchitecture({
    schemaVersion: "0.2",
    project: { name: "demo", root: "/demo" },
    generatedAt: new Date(0).toISOString(),
    extractors: [],
    adapters: [],
    nodes: [product, ...routes],
    edges: [],
    diagnostics: [],
  });
  const byId = new Map(graph.nodes.map((item) => [item.id, item]));
  const api = graph.nodes.find((item) => item.metadata?.systemKey === "api");
  const articles = graph.nodes.find(
    (item) => item.metadata?.routeDomain === "articles" && !item.metadata?.routeGroupNested,
  );
  const comments = graph.nodes.find(
    (item) => item.metadata?.routeGroupNested && item.metadata?.routeSubresource === "comments",
  );
  assert.ok(api && articles && comments);
  assert.equal(isClusterWalkHub(api), false);
  assert.equal(isClusterWalkHub(articles), true);
  assert.equal(isClusterWalkHub(comments), true);
  assert.deepEqual(clusterWalkAncestors(comments.id, byId), [api.id, articles.id]);
  assert.deepEqual(clusterWalkAncestors(articles.id, byId), [api.id]);
  assert.deepEqual(clusterWalkAncestors(api.id, byId), []);
});


