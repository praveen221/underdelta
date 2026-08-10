import assert from "node:assert/strict";
import test from "node:test";

import { dockerExtractor } from "../dist/extractors/docker.js";
import { graphqlExtractor } from "../dist/extractors/graphql.js";
import { helmExtractor } from "../dist/extractors/helm.js";
import { kubernetesExtractor } from "../dist/extractors/kubernetes.js";
import { kustomizeExtractor } from "../dist/extractors/kustomize.js";
import { mongoExtractor } from "../dist/extractors/mongo.js";
import { openapiExtractor } from "../dist/extractors/openapi.js";
import { prismaExtractor } from "../dist/extractors/prisma.js";
import { pythonExtractor } from "../dist/extractors/python.js";
import { sqlExtractor } from "../dist/extractors/sql.js";
import { terraformExtractor } from "../dist/extractors/terraform.js";
import { typescriptExtractor } from "../dist/extractors/typescript.js";
import { assertObserved, edgeBy, extract, nodeBy } from "./helpers.mjs";

test("typescript extracts declarations, imports, calls, and HTTP routes", async () => {
  const graph = await extract(typescriptExtractor, {
    "src/helper.ts": "export function loadNotes() { return []; }\n",
    "src/server.ts": [
      'import { loadNotes } from "./helper";',
      "export function listNotes() { return loadNotes(); }",
      'app.get("/notes", listNotes);',
      'cache.get("not-a-route");',
      "",
    ].join("\n"),
  });
  const server = nodeBy(graph, "module", "src/server.ts");
  const helper = nodeBy(graph, "module", "src/helper.ts");
  const listNotes = nodeBy(graph, "function", "listNotes");
  const loadNotes = nodeBy(graph, "function", "loadNotes");
  const route = nodeBy(graph, "route", "GET /notes");
  edgeBy(graph, "imports", server.id, helper.id);
  edgeBy(graph, "calls", listNotes.id, loadNotes.id);
  assert.equal(route.metadata.path, "/notes");
  assertObserved(route, "src/server.ts", 3);
  assert.equal(graph.nodes.some((node) => node.kind === "route" && node.label.includes("not-a-route")), false);
});

test("typescript emits explicit Prisma read, write, and query bindings", async () => {
  const graph = await extract(typescriptExtractor, {
    "src/notes.ts": [
      "export function listNotes() { return prisma.note.findMany(); }",
      "export function saveNote() { return prisma.note.upsert({}); }",
      "export function inspectNotes() { return prisma.note.customQuery(); }",
      "",
    ].join("\n"),
  });
  const table = nodeBy(graph, "table", "note");
  const list = nodeBy(graph, "function", "listNotes");
  const save = nodeBy(graph, "function", "saveNote");
  const inspect = nodeBy(graph, "function", "inspectNotes");
  edgeBy(graph, "reads", list.id, table.id);
  edgeBy(graph, "writes", save.id, table.id);
  edgeBy(graph, "queries", inspect.id, table.id);
});

test("python extracts FastAPI routes with observed evidence", async () => {
  const graph = await extract(pythonExtractor, {
    "app.py": [
      "from fastapi import FastAPI",
      "app = FastAPI()",
      '@app.get("/notes")',
      "def list_notes():",
      "    return []",
      "",
    ].join("\n"),
  });
  const route = nodeBy(graph, "route", "GET /notes");
  assert.equal(route.metadata.framework, "fastapi");
  assertObserved(route, "app.py", 3);
});

test("prisma extracts models, scalar fields, and relations", async () => {
  const graph = await extract(prismaExtractor, {
    "schema.prisma": [
      "model User {",
      "  id Int @id",
      "  notes Note[]",
      "}",
      "model Note {",
      "  id Int @id",
      "  author User @relation(fields: [authorId], references: [id])",
      "  authorId Int",
      "}",
      "",
    ].join("\n"),
  });
  const user = nodeBy(graph, "table", "User");
  const note = nodeBy(graph, "table", "Note");
  const id = nodeBy(graph, "column", "id");
  assert.equal(id.parentId, user.id);
  assert.ok(graph.edges.some((edge) => edge.kind === "depends-on" && edge.source === note.id && edge.target === user.id));
  assertObserved(note, "schema.prisma", 5);
});

test("sql extracts migrations, tables, columns, and foreign keys", async () => {
  const graph = await extract(sqlExtractor, {
    "migrations/001.sql": [
      "CREATE TABLE users (id INTEGER PRIMARY KEY);",
      "CREATE TABLE notes (id INTEGER, author_id INTEGER REFERENCES users(id));",
      "",
    ].join("\n"),
  });
  const users = nodeBy(graph, "table", "users");
  const notes = nodeBy(graph, "table", "notes");
  const column = nodeBy(graph, "column", "author_id");
  assert.equal(column.parentId, notes.id);
  assert.ok(graph.edges.some((edge) => edge.kind === "depends-on" && edge.source === notes.id && edge.target === users.id));
  assertObserved(users, "migrations/001.sql", 1);
});

test("mongo extracts models and aggregate pipelines", async () => {
  const graph = await extract(mongoExtractor, {
    "src/notes.ts": [
      'import mongoose from "mongoose";',
      "const Note = mongoose.model(\"Note\", new mongoose.Schema({ title: String }));",
      "Note.aggregate([{ $match: { published: true } }]);",
      "",
    ].join("\n"),
  });
  const notes = nodeBy(graph, "collection", "Note");
  assert.equal(notes.technology, "mongoose");
  const pipeline = graph.nodes.find((node) => node.kind === "pipeline");
  assert.ok(pipeline);
  edgeBy(graph, "queries", pipeline.id, notes.id);
  assertObserved(notes, "src/notes.ts", 2);
});

test("openapi extracts declared operations and ignores unrelated YAML", async () => {
  const graph = await extract(openapiExtractor, {
    "openapi.yaml": [
      "openapi: 3.0.0",
      "info:",
      "  title: Notes API",
      "paths:",
      "  /notes:",
      "    get:",
      "      operationId: listNotes",
      "",
    ].join("\n"),
    "k8s/deployment.yaml": "apiVersion: apps/v1\nkind: Deployment\n",
  });
  const route = nodeBy(graph, "route", "GET /notes");
  assert.equal(route.metadata.operationId, "listNotes");
  assertObserved(route, "openapi.yaml", 6);
  assert.equal(graph.nodes.some((node) => node.label === "k8s/deployment.yaml"), false);
});

test("graphql extracts schema operations", async () => {
  const graph = await extract(graphqlExtractor, {
    "schema.graphql": [
      "type Query {",
      "  note: Note",
      "}",
      "type Mutation {",
      "  createNote: Note",
      "}",
      "type Note { id: ID! }",
      "",
    ].join("\n"),
  });
  const query = nodeBy(graph, "route", "Query note");
  const mutation = nodeBy(graph, "route", "Mutation createNote");
  assert.equal(query.metadata.operationType, "query");
  assert.equal(mutation.metadata.operationType, "mutation");
  assertObserved(query, "schema.graphql", 2);
});

test("docker extracts Compose services and declared dependencies", async () => {
  const graph = await extract(dockerExtractor, {
    "docker-compose.yml": [
      "services:",
      "  api:",
      "    image: example/api:1",
      "    depends_on:",
      "      - db",
      "  db:",
      "    image: postgres:16",
      "",
    ].join("\n"),
  });
  const api = nodeBy(graph, "service", "api");
  const db = nodeBy(graph, "service", "db");
  edgeBy(graph, "depends-on", api.id, db.id);
  assertObserved(api, "docker-compose.yml", 2);
});

test("terraform extracts modules and resources", async () => {
  const graph = await extract(terraformExtractor, {
    "main.tf": [
      'module "network" {',
      '  source = "./network"',
      "}",
      'resource "aws_s3_bucket" "notes" {}',
      "",
    ].join("\n"),
  });
  const module = nodeBy(graph, "service", "module.network");
  const bucket = nodeBy(graph, "service", "aws_s3_bucket.notes");
  assert.equal(module.metadata.moduleSource, "./network");
  assertObserved(bucket, "main.tf", 4);
});

test("kubernetes extracts workload, service, and selector dependency", async () => {
  const graph = await extract(kubernetesExtractor, {
    "k8s/app.yaml": [
      "apiVersion: apps/v1",
      "kind: Deployment",
      "metadata:",
      "  name: notes-api",
      "spec:",
      "  selector:",
      "    matchLabels:",
      "      app: notes",
      "---",
      "apiVersion: v1",
      "kind: Service",
      "metadata:",
      "  name: notes-api",
      "spec:",
      "  selector:",
      "    app: notes",
      "",
    ].join("\n"),
  });
  const deployment = nodeBy(graph, "service", "Deployment/notes-api");
  const service = nodeBy(graph, "service", "Service/notes-api");
  edgeBy(graph, "depends-on", service.id, deployment.id);
  assertObserved(deployment, "k8s/app.yaml", 2);
});

test("kustomize extracts overlay-to-base dependencies", async () => {
  const graph = await extract(kustomizeExtractor, {
    "kustomize/bases/api/kustomization.yaml": "resources:\n  - deployment.yaml\n",
    "kustomize/overlays/dev/kustomization.yaml": "resources:\n  - ../../bases/api\n",
  });
  const base = nodeBy(graph, "service", "Base/api");
  const overlay = nodeBy(graph, "service", "Overlay/dev");
  edgeBy(graph, "depends-on", overlay.id, base.id);
  assertObserved(overlay, "kustomize/overlays/dev/kustomization.yaml", 1);
});

test("helm extracts chart identity and concrete template resources", async () => {
  const graph = await extract(helmExtractor, {
    "charts/notes/Chart.yaml": "name: notes\nversion: 1.0.0\nappVersion: 2.0.0\n",
    "charts/notes/templates/service.yaml": [
      "apiVersion: v1",
      "kind: Service",
      "metadata:",
      "  name: notes",
      "",
    ].join("\n"),
  });
  const chart = nodeBy(graph, "service", "Chart/notes");
  const service = nodeBy(graph, "service", "Service/notes");
  assert.equal(chart.metadata.chartVersion, "1.0.0");
  assert.equal(service.metadata.chartName, "notes");
  assertObserved(chart, "charts/notes/Chart.yaml", 1);
});
