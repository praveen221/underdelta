import assert from "node:assert/strict";
import test from "node:test";

import { celeryScheduledWorkAdapter } from "../dist/adapters/scheduled/celery.js";
import { kubernetesScheduledWorkAdapter } from "../dist/adapters/scheduled/kubernetes.js";
import { nodeScheduledWorkAdapter } from "../dist/adapters/scheduled/node.js";
import { unsupportedScheduledWorkAdapter } from "../dist/adapters/scheduled/unsupported.js";
import { kubernetesExtractor } from "../dist/extractors/kubernetes.js";
import { pythonExtractor } from "../dist/extractors/python.js";
import { typescriptExtractor } from "../dist/extractors/typescript.js";
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
  const deployUnit = graph.nodes.find((node) => facetOrUndefined(node, "deploy-unit"));
  assert.ok(deployUnit);
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
