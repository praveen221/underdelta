import assert from "node:assert/strict";
import test from "node:test";

import { dataResourceAdapter } from "../dist/adapters/data/resources.js";
import { deployUnitAdapter } from "../dist/adapters/deploy/units.js";
import { httpEndpointAdapter } from "../dist/adapters/http/endpoints.js";
import { unsupportedHttpAdapter } from "../dist/adapters/http/unsupported.js";
import { celeryScheduledWorkAdapter } from "../dist/adapters/scheduled/celery.js";
import { kubernetesScheduledWorkAdapter } from "../dist/adapters/scheduled/kubernetes.js";
import { nodeScheduledWorkAdapter } from "../dist/adapters/scheduled/node.js";
import { unsupportedScheduledWorkAdapter } from "../dist/adapters/scheduled/unsupported.js";
import { kubernetesExtractor } from "../dist/extractors/kubernetes.js";
import { dockerExtractor } from "../dist/extractors/docker.js";
import { helmExtractor } from "../dist/extractors/helm.js";
import { kustomizeExtractor } from "../dist/extractors/kustomize.js";
import { mongoExtractor } from "../dist/extractors/mongo.js";
import { openapiExtractor } from "../dist/extractors/openapi.js";
import { prismaExtractor } from "../dist/extractors/prisma.js";
import { pythonExtractor } from "../dist/extractors/python.js";
import { typescriptExtractor } from "../dist/extractors/typescript.js";
import { terraformExtractor } from "../dist/extractors/terraform.js";
import { adapt, edgeBy } from "./helpers.mjs";

function facet(node, kind) {
  const value = node.semantics?.find((candidate) => candidate.kind === kind);
  assert.ok(value, `expected ${kind} semantic facet on ${node.label}`);
  return value;
}

function assertScheduledContract(graph, provider, handler) {
  const trigger = graph.nodes.find((node) => facetOrUndefined(node, "trigger")?.provider === provider);
  const job = graph.nodes.find((node) => facetOrUndefined(node, "job")?.provider === provider);
  assert.ok(trigger, `expected ${provider} trigger`);
  assert.ok(job, `expected ${provider} job`);
  assert.equal(facet(job, "job").handler, handler);
  edgeBy(graph, "schedules", trigger.id, job.id);
  return { trigger, job };
}

function facetOrUndefined(node, kind) {
  return node.semantics?.find((candidate) => candidate.kind === kind);
}

test("data resources normalize to typed database, table, and collection facets", async () => {
  const graph = await adapt(dataResourceAdapter, [prismaExtractor, mongoExtractor], {
    "prisma/schema.prisma": [
      "model Note {",
      "  id Int @id",
      "}",
      "",
    ].join("\n"),
    "src/models/note.ts": [
      'import mongoose from "mongoose";',
      'mongoose.model("Article", new mongoose.Schema({ title: String }));',
      "",
    ].join("\n"),
  });
  const database = graph.nodes.find((node) => node.kind === "database");
  const table = graph.nodes.find((node) => node.kind === "table");
  const collection = graph.nodes.find((node) => node.kind === "collection");
  assert.deepEqual(facet(database, "resource"), {
    kind: "resource",
    resourceKind: "database",
    provider: "prisma",
  });
  assert.deepEqual(facet(table, "resource"), {
    kind: "resource",
    resourceKind: "table",
    provider: "prisma",
  });
  assert.deepEqual(facet(collection, "resource"), {
    kind: "resource",
    resourceKind: "collection",
    provider: "mongoose",
  });
  assert.equal(graph.adapter.capability, "data-access");
});

test("deployment technologies normalize to one typed deploy-unit contract", async () => {
  const graph = await adapt(
    deployUnitAdapter,
    [
      dockerExtractor,
      terraformExtractor,
      kubernetesExtractor,
      helmExtractor,
      kustomizeExtractor,
    ],
    {
      "docker-compose.yml": [
        "services:",
        "  api:",
        "    image: example/api:1",
        "    ports:",
        '      - "8080:80"',
        "",
      ].join("\n"),
      "infra/main.tf": 'resource "aws_s3_bucket" "notes" {}\n',
      "k8s/app.yaml": [
        "apiVersion: apps/v1",
        "kind: Deployment",
        "metadata:",
        "  name: notes-api",
        "  namespace: production",
        "",
      ].join("\n"),
      "charts/notes/Chart.yaml": "name: notes\nversion: 1.0.0\n",
      "kustomize/overlays/dev/kustomization.yaml": [
        "namespace: development",
        "resources:",
        "  - ../../base",
        "",
      ].join("\n"),
    },
  );

  const units = graph.nodes.map((node) => facet(node, "deploy-unit"));
  assert.equal(graph.adapter.capability, "deployment");
  assert.deepEqual(
    new Set(units.map((unit) => `${unit.provider}:${unit.deployKind}`)),
    new Set([
      "docker-compose:container",
      "terraform:infrastructure",
      "kubernetes:workload",
      "helm:package",
      "kustomize:overlay",
    ]),
  );
  assert.deepEqual(
    units.find((unit) => unit.provider === "docker-compose"),
    {
      kind: "deploy-unit",
      deployKind: "container",
      provider: "docker-compose",
      nativeKind: "Compose service",
      name: "api",
      image: "example/api:1",
      ports: ["8080:80"],
    },
  );
  assert.equal(
    units.find((unit) => unit.provider === "kubernetes").namespace,
    "production",
  );
});

test("HTTP route facts normalize across Express, Next, FastAPI, and OpenAPI", async () => {
  const graph = await adapt(
    httpEndpointAdapter,
    [typescriptExtractor, pythonExtractor, openapiExtractor],
    {
      "package.json": JSON.stringify({ dependencies: { express: "latest" } }),
      "src/api.ts": [
        'import express from "express";',
        "const app = express();",
        "export function listNotes() {}",
        'app.get("/notes", listNotes);',
        "",
      ].join("\n"),
      "app/api/health/route.ts": "export async function GET() {}\n",
      "api.py": [
        "from fastapi import FastAPI",
        "app = FastAPI()",
        '@app.post("/notes")',
        "def create_note():",
        "    pass",
        "",
      ].join("\n"),
      "openapi.yaml": [
        "openapi: 3.0.0",
        "info:",
        "  title: Notes",
        "paths:",
        "  /notes/{id}:",
        "    delete:",
        "      operationId: deleteNote",
        "      responses: {}",
        "",
      ].join("\n"),
    },
  );

  const endpoints = graph.nodes.map((node) => facet(node, "endpoint"));
  assert.equal(graph.adapter.capability, "http-api");
  assert.deepEqual(
    new Set(endpoints.map((endpoint) => `${endpoint.provider}:${endpoint.method}:${endpoint.path}`)),
    new Set([
      "express:GET:/notes",
      "next:GET:/api/health",
      "fastapi:POST:/notes",
      "openapi:DELETE:/notes/{id}",
    ]),
  );
  assert.deepEqual(
    endpoints.find((endpoint) => endpoint.provider === "openapi"),
    {
      kind: "endpoint",
      protocol: "http",
      method: "DELETE",
      path: "/notes/{id}",
      provider: "openapi",
      declaration: "contract",
      operationId: "deleteNote",
    },
  );
  const fastApiRoute = graph.nodes.find(
    (node) => facetOrUndefined(node, "endpoint")?.provider === "fastapi",
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.kind === "routes-to" &&
        edge.source === fastApiRoute.id &&
        edge.target.includes("create_note"),
    ),
    "expected FastAPI decorator to bind to its adjacent function",
  );
});

test("unsupported Node HTTP frameworks produce no normalized endpoints", async () => {
  const graph = await adapt(httpEndpointAdapter, [typescriptExtractor], {
    "package.json": JSON.stringify({ dependencies: { hono: "latest" } }),
    "src/api.ts": [
      'import { Hono } from "hono";',
      "const app = new Hono();",
      "export function health() {}",
      'app.get("/health", health);',
      "",
    ].join("\n"),
  });
  assert.equal(graph.nodes.length, 0);
});

test("node-cron normalizes a trigger, job, and handler binding", async () => {
  const graph = await adapt(nodeScheduledWorkAdapter, [typescriptExtractor], {
    "src/jobs.ts": [
      'import cron from "node-cron";',
      "export function exportData() {}",
      'cron.schedule("*/5 * * * * *", () => { exportData(); }, { timezone: "UTC" });',
      "",
    ].join("\n"),
  });
  const { trigger, job } = assertScheduledContract(graph, "node-cron", "exportData");
  assert.deepEqual(facet(trigger, "trigger"), {
    kind: "trigger",
    triggerKind: "cron",
    provider: "node-cron",
    expression: "*/5 * * * * *",
    timezone: "UTC",
    declaration: "code",
  });
  assert.ok(graph.edges.some((edge) => edge.kind === "handled-by" && edge.source === job.id));
});

test("same-named handlers in different modules remain distinct jobs", async () => {
  const graph = await adapt(nodeScheduledWorkAdapter, [typescriptExtractor], {
    "src/digest.ts": [
      'import cron from "node-cron";',
      "export function run() {}",
      'cron.schedule("0 * * * *", run);',
      "",
    ].join("\n"),
    "src/cleanup.ts": [
      'import cron from "node-cron";',
      "export function run() {}",
      'cron.schedule("30 * * * *", run);',
      "",
    ].join("\n"),
  });
  const jobs = graph.nodes.filter(
    (node) => facetOrUndefined(node, "job")?.provider === "node-cron",
  );
  assert.equal(jobs.length, 2);
  assert.notEqual(jobs[0].id, jobs[1].id);
});

test("cron package and Nest decorators use the scheduled-work contract", async () => {
  const graph = await adapt(nodeScheduledWorkAdapter, [typescriptExtractor], {
    "src/jobs.ts": [
      'import { CronJob } from "cron";',
      'import { Cron } from "@nestjs/schedule";',
      "export function cleanup() {}",
      'new CronJob("0 0 * * *", cleanup);',
      "class Tasks {",
      '  @Cron("0 * * * *", { timeZone: "UTC" })',
      "  digest() {}",
      "}",
      "",
    ].join("\n"),
  });
  const providers = graph.nodes
    .map((node) => facetOrUndefined(node, "trigger")?.provider)
    .filter(Boolean)
    .sort();
  assert.deepEqual(providers, ["@nestjs/schedule", "cron"]);
});

test("Celery beat and task declarations normalize to one scheduled job", async () => {
  const graph = await adapt(celeryScheduledWorkAdapter, [pythonExtractor], {
    "tasks.py": [
      "from celery import shared_task",
      "@shared_task",
      "def task_1():",
      "    pass",
      "from celery.schedules import crontab",
      "CELERYBEAT_SCHEDULE = {",
      '    "task one": {"task": "task_1", "schedule": crontab(minute=0, hour="*")},',
      "}",
      "",
    ].join("\n"),
  });
  const { trigger, job } = assertScheduledContract(graph, "celery", "task_1");
  assert.equal(facet(trigger, "trigger").expression, "0 * * * *");
  assert.equal(
    new Set(
      graph.nodes
        .filter((node) => facetOrUndefined(node, "job")?.provider === "celery")
        .map((node) => node.id),
    ).size,
    1,
  );
  assert.ok(graph.edges.some((edge) => edge.kind === "handled-by" && edge.source === job.id));
});

test("Kubernetes CronJob uses the same trigger and job contract", async () => {
  const graph = await adapt(kubernetesScheduledWorkAdapter, [kubernetesExtractor], {
    "k8s/digest.yaml": [
      "apiVersion: batch/v1",
      "kind: CronJob",
      "metadata:",
      "  name: digest",
      "spec:",
      '  schedule: "0 * * * *" # run at the start of each hour',
      '  timeZone: "UTC"',
      "  jobTemplate: {}",
      "",
    ].join("\n"),
  });
  const { trigger, job } = assertScheduledContract(graph, "kubernetes", undefined);
  assert.equal(facet(trigger, "trigger").declaration, "infrastructure");
  assert.equal(facet(job, "job").executionKind, "container");
  const deployUnit = graph.nodes.find((node) => node.qualifiedName === "CronJob/digest");
  assert.ok(deployUnit, "expected the extracted Kubernetes resource binding");
  assert.equal(facetOrUndefined(deployUnit, "deploy-unit"), undefined);
  edgeBy(graph, "uses", job.id, deployUnit.id);
});

test("unsupported scheduler dependencies produce an explicit diagnostic", async () => {
  const graph = await adapt(unsupportedScheduledWorkAdapter, [], {
    "package.json": JSON.stringify({ dependencies: { agenda: "latest" } }),
  });
  assert.deepEqual(graph.diagnostics?.map(({ code }) => code), [
    "unsupported-scheduled-framework",
  ]);
  assert.match(graph.diagnostics[0].message, /agenda detected/);
});

test("unsupported HTTP frameworks produce explicit diagnostics", async () => {
  const graph = await adapt(unsupportedHttpAdapter, [], {
    "package.json": JSON.stringify({ dependencies: { hono: "latest" } }),
    "requirements.txt": "flask==3.1.0\n",
  });
  assert.deepEqual(
    graph.diagnostics.map(({ code }) => code),
    ["unsupported-http-framework", "unsupported-http-framework"],
  );
  assert.deepEqual(
    new Set(graph.diagnostics.map(({ message }) => message.split(" detected")[0])),
    new Set(["hono", "flask"]),
  );
});
