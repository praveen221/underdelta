import assert from "node:assert/strict";
import test from "node:test";

import { edgeFrom } from "../dist/graph.js";
import {
  isClientApiFunction,
  isClientApisOnlyHttpApi,
  liftFePageStoryEdges,
} from "../dist/projection/feStories.js";

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
