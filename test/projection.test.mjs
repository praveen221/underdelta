import assert from "node:assert/strict";
import test from "node:test";

import { edgeFrom } from "../dist/graph.js";
import { isClientApisOnlyHttpApi as projectClientApisOnly } from "../dist/project.js";
import {
  isClientApiFunction,
  isClientApisOnlyHttpApi,
  liftFePageStoryEdges,
} from "../dist/projection/feStories.js";
import {
  liftDataAccessStoryEdges,
  projectDataArchitecture,
} from "../dist/projection/data.js";
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
