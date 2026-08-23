import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyzeArchitecture,
  formatAnalysisLines,
} from "../dist/analysis.js";
import { discoverFiles } from "../dist/extractor.js";
import {
  isUnderdeltaToolingRepo,
  parseReadmeHeadingHints,
  parseReadmeTitle,
  projectSemanticArchitecture,
} from "../dist/project.js";

const evidence = {
  file: "jobs.py",
  extractor: "test",
  certainty: "observed",
};

function analysisGraph({ nodes = [], diagnostics = [], fileCount = 3 } = {}) {
  return {
    schemaVersion: "0.2",
    project: { name: "analysis", root: "/analysis" },
    generatedAt: new Date(0).toISOString(),
    extractors: [],
    adapters: [],
    nodes: [
      {
        id: "product",
        kind: "product",
        label: "Analysis",
        metadata: { fileCount },
        evidence: [evidence],
      },
      ...nodes,
    ],
    edges: [],
    diagnostics,
  };
}

test("analysis reports evidence-backed capabilities without claiming completeness", () => {
  const graph = analysisGraph({
    nodes: [
      {
        id: "route",
        kind: "route",
        label: "GET /notes",
        semantics: [{
          kind: "endpoint",
          protocol: "http",
          method: "GET",
          path: "/notes",
          provider: "express",
          declaration: "code",
        }],
        metadata: {},
        evidence: [evidence],
      },
      {
        id: "table",
        kind: "table",
        label: "Note",
        semantics: [{ kind: "resource", resourceKind: "table", provider: "prisma" }],
        metadata: {},
        evidence: [{ ...evidence, certainty: "derived" }],
      },
    ],
  });
  const analysis = analyzeArchitecture(graph);
  assert.equal(analysis.status, "mapped");
  assert.deepEqual(
    analysis.capabilities.map(({ id, count }) => [id, count]),
    [["http", 1], ["data", 1]],
  );
  assert.match(analysis.message, /Mapped 2 supported capabilities/);
  assert.deepEqual(analysis.certainty, { observed: 2, derived: 1, inferred: 0 });
});

test("analysis distinguishes unsupported technology from an empty map", () => {
  const diagnostic = {
    severity: "warning",
    code: "unsupported-scheduled-framework",
    message: "agenda detected; no scheduled-work adapter is installed",
    evidence,
  };
  const partial = analyzeArchitecture(
    analysisGraph({ diagnostics: [diagnostic], fileCount: 1 }),
  );
  assert.equal(partial.status, "partial");
  assert.equal(partial.unsupported.length, 1);
  assert.match(formatAnalysisLines(partial).join("\n"), /Warning: agenda detected/);

  const empty = analyzeArchitecture(analysisGraph({ fileCount: 7 }));
  assert.equal(empty.status, "empty");
  assert.match(empty.message, /No supported product\/runtime evidence found/);
  assert.equal(empty.issues.length, 0);
});

test("CLI reports an invalid repository path without a stack trace", () => {
  const missing = path.join(os.tmpdir(), "underdelta-path-that-does-not-exist");
  const result = spawnSync(
    process.execPath,
    ["dist/cli.js", "scan", missing],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^Underdelta failed: Repository does not exist:/);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
});

test("README parsing keeps a real product title and ignores setup-code headings", () => {
  const readme = [
    '<h1 align="center">TrackNotch</h1>',
    "",
    "## Setup",
    "```bash",
    "# Install Claude Code if you haven't already",
    "npm install -g @anthropic-ai/claude-code",
    "```",
    "",
    "## API",
    "Notes API lives in `src/server.ts`.",
    "",
  ].join("\n");
  assert.equal(parseReadmeTitle(readme), "TrackNotch");
  assert.deepEqual(parseReadmeHeadingHints(readme), []);
});

test("Underdelta self-map projection is not activated by familiar filenames", () => {
  assert.equal(
    isUnderdeltaToolingRepo({ packageManifest: { name: "decoy-tooling" } }),
    false,
  );
  assert.equal(
    isUnderdeltaToolingRepo({ packageManifest: { name: "underdelta" } }),
    true,
  );
});

test("README job headings cannot rename the scheduled-work system", () => {
  const graph = projectSemanticArchitecture({
    schemaVersion: "0.2",
    project: { name: "example", root: "/example" },
    generatedAt: new Date(0).toISOString(),
    extractors: [],
    adapters: [],
    nodes: [
      {
        id: "product",
        kind: "product",
        label: "Example",
        metadata: {},
        evidence: [evidence],
      },
      {
        id: "job",
        kind: "job",
        label: "daily-task",
        semantics: [{
          kind: "job",
          executionKind: "queue",
          provider: "celery",
          handler: "daily_task",
        }],
        metadata: {},
        evidence: [evidence],
      },
    ],
    edges: [],
    diagnostics: [],
  }, {
    readmeHints: [{
      key: "jobs",
      label: "Job With Generated Name",
      heading: "Job With Generated Name",
    }],
  });

  const jobs = graph.nodes.find((node) => node.metadata.systemKey === "jobs");
  assert.equal(jobs?.label, "Scheduled jobs");
});

test("repository discovery excludes test, verification, and cache inputs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-discovery-"));
  try {
    await Promise.all([
      writeFile(path.join(root, "src.ts"), "export {};\n"),
      mkdir(path.join(root, "verification"), { recursive: true }),
      mkdir(path.join(root, "tests"), { recursive: true }),
      mkdir(path.join(root, ".underdelta-real"), { recursive: true }),
      mkdir(path.join(root, ".dogfood-repos"), { recursive: true }),
      mkdir(path.join(root, ".dogfood-scans"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(root, "verification", "fake.ts"), "export {};\n"),
      writeFile(path.join(root, "tests", "example.ts"), "export {};\n"),
      writeFile(path.join(root, ".underdelta-real", "cached.ts"), "export {};\n"),
      writeFile(path.join(root, ".dogfood-repos", "external.ts"), "export {};\n"),
      writeFile(path.join(root, ".dogfood-scans", "output.ts"), "export {};\n"),
      writeFile(path.join(root, "src.test.ts"), "export {};\n"),
    ]);
    const files = await discoverFiles(root);
    assert.deepEqual(files.map((file) => path.basename(file)), ["src.ts"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("coverage catalog names the HTTP and scheduler stacks we refuse to invent", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const catalog = await readFile(path.join(root, "coverage-data.js"), "utf8");
  const http = await readFile(
    path.join(root, "src/adapters/http/unsupported.ts"),
    "utf8",
  );
  const scheduled = await readFile(
    path.join(root, "src/adapters/scheduled/unsupported.ts"),
    "utf8",
  );
  for (const name of [
    "fastify",
    "hono",
    "elysia",
    "sanic",
    "agenda",
    "apscheduler",
  ]) {
    assert.match(catalog, new RegExp(name, "i"), `coverage missing ${name}`);
    const source = name === "apscheduler" || name === "agenda" ? scheduled : http;
    assert.match(source, new RegExp(name.replace("-", "[-_]")), `adapter missing ${name}`);
  }
  assert.match(catalog, /LangChain/);
  assert.match(catalog, /depth: "none"/);
});
