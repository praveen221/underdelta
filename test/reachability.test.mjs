import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { analyzeArchitecture } from "../dist/analysis.js";
import { compileRepository } from "../dist/compile.js";
import { typescriptExtractor } from "../dist/extractors/typescript.js";
import {
  assertImpactCompileSource,
  computeChangeImpact,
  isIgnorableWorktreePath,
  isWorktreeClean,
  listChangedFiles,
} from "../dist/impact.js";
import {
  collectCallMetrics,
  findPaths,
  pathsFromSymbolToResources,
} from "../dist/reachability.js";
import { impactReportSchema } from "../dist/schema.js";
import { edgeBy, extract, nodeBy } from "./helpers.mjs";

const execFileAsync = promisify(execFile);

async function git(root, args) {
  await execFileAsync("git", args, { cwd: root });
}

async function initGitRepo(root) {
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "test@underdelta.local"]);
  await git(root, ["config", "user.name", "Underdelta Test"]);
}

test("typescript resolves imported calls without relying on unique names", async () => {
  const graph = await extract(typescriptExtractor, {
    "src/a.ts": "export function shared() { return 1; }\n",
    "src/b.ts": "export function shared() { return 2; }\n",
    "src/use.ts": [
      'import { shared as fromA } from "./a";',
      'import { shared as fromB } from "./b";',
      "export function run() { return fromA() + fromB(); }",
      "",
    ].join("\n"),
  });
  const run = nodeBy(graph, "function", "run");
  const aShared = graph.nodes.find(
    (node) =>
      node.kind === "function" && node.qualifiedName === "src/a.ts#shared",
  );
  const bShared = graph.nodes.find(
    (node) =>
      node.kind === "function" && node.qualifiedName === "src/b.ts#shared",
  );
  assert.ok(aShared && bShared);
  edgeBy(graph, "calls", run.id, aShared.id);
  edgeBy(graph, "calls", run.id, bShared.id);
});

test("typescript keeps same-named methods on different classes distinct", async () => {
  const graph = await extract(typescriptExtractor, {
    "src/workers.ts": [
      "export class A {",
      "  run() { helperA(); }",
      "}",
      "export class B {",
      "  run() { helperB(); }",
      "}",
      "function helperA() {}",
      "function helperB() {}",
      "",
    ].join("\n"),
  });
  const methods = graph.nodes.filter(
    (node) => node.label === "run" && node.metadata?.declaration === "method",
  );
  assert.equal(methods.length, 2, "expected distinct A.run and B.run symbols");
  const ids = new Set(methods.map((node) => node.id));
  assert.equal(ids.size, 2);
  const qualified = new Set(methods.map((node) => node.qualifiedName));
  assert.ok(qualified.has("src/workers.ts#A.run"));
  assert.ok(qualified.has("src/workers.ts#B.run"));

  const helperA = nodeBy(graph, "function", "helperA");
  const helperB = nodeBy(graph, "function", "helperB");
  const aRun = methods.find((node) => node.qualifiedName === "src/workers.ts#A.run");
  const bRun = methods.find((node) => node.qualifiedName === "src/workers.ts#B.run");
  edgeBy(graph, "calls", aRun.id, helperA.id);
  edgeBy(graph, "calls", bRun.id, helperB.id);
  // Cross-contamination must not happen.
  assert.equal(
    graph.edges.some(
      (edge) =>
        edge.kind === "calls" &&
        edge.source === aRun.id &&
        edge.target === helperB.id,
    ),
    false,
  );
});

test("typescript resolves namespace import method calls and re-exports", async () => {
  const graph = await extract(typescriptExtractor, {
    "src/lib/calc.ts": "export function total(n) { return n; }\n",
    "src/lib/index.ts": 'export { total } from "./calc";\n',
    "src/service.ts": [
      'import * as lib from "./lib";',
      "export function checkout() { return lib.total(1); }",
      "",
    ].join("\n"),
  });
  const checkout = nodeBy(graph, "function", "checkout");
  const total = nodeBy(graph, "function", "total");
  edgeBy(graph, "calls", checkout.id, total.id);
});

test("typescript records ambiguous same-name calls without inventing edges", async () => {
  const graph = await extract(typescriptExtractor, {
    "src/a.ts": "export function twin() { return 1; }\n",
    "src/b.ts": "export function twin() { return 2; }\n",
    "src/use.ts": [
      // No import — bare twin() is ambiguous across the repo.
      "export function run() { return twin(); }",
      "",
    ].join("\n"),
  });
  const run = nodeBy(graph, "function", "run");
  const callEdges = graph.edges.filter(
    (edge) => edge.kind === "calls" && edge.source === run.id,
  );
  assert.equal(callEdges.length, 0);
  assert.ok(
    graph.diagnostics.some(
      (diagnostic) => diagnostic.code === "call-ambiguous",
    ),
  );
});

test("call metrics, endpoint impact, and upstream paths are evidence-backed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-reach-"));
  try {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "reach-fixture" }),
      "utf8",
    );
    await writeFile(
      path.join(root, "src", "billing.ts"),
      [
        "export function calculateTotal() {",
        "  return prisma.order.create({});",
        "}",
        "export function checkout() {",
        "  return calculateTotal();",
        "}",
        'app.post("/checkout", checkout);',
        "",
      ].join("\n"),
      "utf8",
    );
    const graph = await compileRepository(root);
    const metrics = collectCallMetrics(graph);
    assert.ok(metrics.callsResolved >= 1);

    const checkout = graph.nodes.find(
      (node) => node.kind === "function" && node.label === "checkout",
    );
    const calculate = graph.nodes.find(
      (node) => node.kind === "function" && node.label === "calculateTotal",
    );
    assert.ok(checkout && calculate);
    const paths = pathsFromSymbolToResources(graph, checkout.id);
    assert.ok(paths.length >= 1, "expected checkout → resource path");
    const analysis = analyzeArchitecture(graph);
    assert.ok(analysis.callMetrics.callsResolved >= 1);

    // Changing only the leaf utility must still surface the upstream endpoint.
    const impact = computeChangeImpact(graph, ["src/billing.ts"]);
    // Narrow seeds by computing on full file then checking endpoint + paths.
    const report = impactReportSchema.parse(impact);
    assert.ok(
      report.changed.symbols.some((symbol) => symbol.label === "checkout"),
    );
    assert.ok(
      report.impact.endpoints.some(
        (endpoint) =>
          endpoint.method === "POST" && endpoint.path === "/checkout",
      ),
      "POST /checkout must appear in impact.endpoints",
    );
    assert.ok(
      report.impact.resources.some((resource) => resource.label === "order"),
    );

    const leafImpact = computeChangeImpact(graph, ["src/billing.ts"]);
    // Re-run with only calculate as seed via synthetic changed symbols path:
    // full file includes calculate; require an upstream path into calculate.
    const route = graph.nodes.find(
      (node) => node.kind === "route" && node.label === "POST /checkout",
    );
    assert.ok(route);
    const upstreamPaths = findPaths(
      graph,
      route.id,
      (node) => node.id === calculate.id,
      { maxDepth: 8, maxPaths: 5 },
    );
    assert.ok(
      upstreamPaths.length >= 1,
      "expected POST /checkout → … → calculateTotal path",
    );
    assert.ok(
      leafImpact.paths.some(
        (path) =>
          path.fromSymbolId === route.id ||
          path.steps.some((step) => step.to === calculate.id) ||
          path.fromSymbolId === calculate.id,
      ) ||
        leafImpact.paths.some((path) =>
          path.steps.some(
            (step) => step.to === route.id || path.fromSymbolId === route.id,
          ),
        ),
      "impact report must serialize a path that justifies endpoint or resource claims",
    );
    // Stronger: at least one path starts at the route (upstream serialization).
    assert.ok(
      leafImpact.paths.some((path) => path.fromSymbolId === route.id),
      "upstream path from POST /checkout must be present when reverse reachability finds it",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("findPaths stops at product anchors with evidence certainty", async () => {
  const graph = await extract(typescriptExtractor, {
    "src/h.ts": [
      "export function writeOrder() { return prisma.order.create({}); }",
      "export function handle() { return writeOrder(); }",
      "",
    ].join("\n"),
  });
  const handle = nodeBy(graph, "function", "handle");
  const paths = findPaths(
    {
      schemaVersion: "0.2",
      project: { name: "t", root: "." },
      generatedAt: new Date().toISOString(),
      extractors: [],
      adapters: [],
      nodes: graph.nodes,
      edges: graph.edges,
      diagnostics: graph.diagnostics ?? [],
    },
    handle.id,
    (node) => node.kind === "table",
  );
  assert.ok(paths.length >= 1);
  assert.ok(
    paths[0].steps.some(
      (step) => step.edgeKind === "writes" || step.edgeKind === "calls",
    ),
  );
});

test("service-file impact reaches Express routes through inline callbacks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-anon-"));
  try {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "anon-express" }),
      "utf8",
    );
    await writeFile(
      path.join(root, "src", "article.service.ts"),
      [
        "export function getArticle() {",
        "  return prisma.article.findMany();",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(root, "src", "article.controller.ts"),
      [
        'import { getArticle } from "./article.service";',
        'router.get("/articles", auth.required, function (req, res) {',
        "  return getArticle();",
        "});",
        "",
      ].join("\n"),
      "utf8",
    );
    const graph = await compileRepository(root);
    const impact = computeChangeImpact(graph, ["src/article.service.ts"]);
    assert.ok(
      impact.impact.endpoints.some(
        (endpoint) =>
          endpoint.method === "GET" && endpoint.path === "/articles",
      ),
      `expected GET /articles from service change, got ${JSON.stringify(impact.impact.endpoints)}`,
    );
    assert.ok(
      impact.impact.resources.some((resource) => resource.label === "article"),
    );
    const route = graph.nodes.find(
      (node) => node.kind === "route" && node.label === "GET /articles",
    );
    assert.ok(route);
    assert.ok(
      impact.paths.some((path) => path.fromSymbolId === route.id),
      "expected upstream path from the route into the changed service",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("worktree change list includes untracked files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-git-"));
  try {
    await initGitRepo(root);
    await writeFile(path.join(root, "package.json"), '{"name":"g"}\n', "utf8");
    await writeFile(path.join(root, "tracked.ts"), "export const x = 1;\n", "utf8");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "init"]);
    await writeFile(
      path.join(root, "brand-new.ts"),
      "export function fresh() { return 1; }\n",
      "utf8",
    );
    const changed = await listChangedFiles(root, {});
    assert.ok(
      changed.files.includes("brand-new.ts"),
      `expected untracked brand-new.ts, got ${JSON.stringify(changed.files)}`,
    );
    assert.equal(changed.worktree, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("base...head uses merge-base range not two-dot tip comparison", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-range-"));
  try {
    await initGitRepo(root);
    await writeFile(path.join(root, "package.json"), '{"name":"g"}\n', "utf8");
    await writeFile(path.join(root, "shared.ts"), "export const a = 1;\n", "utf8");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "root"]);
    // Normalize default branch name across git versions.
    await git(root, ["branch", "-M", "main"]);

    await git(root, ["checkout", "-b", "feature"]);
    await writeFile(
      path.join(root, "feature-only.ts"),
      "export function feature() { return 1; }\n",
      "utf8",
    );
    await git(root, ["add", "feature-only.ts"]);
    await git(root, ["commit", "-m", "feature work"]);

    await git(root, ["checkout", "main"]);
    await writeFile(
      path.join(root, "main-only.ts"),
      "export function mainline() { return 1; }\n",
      "utf8",
    );
    await git(root, ["add", "main-only.ts"]);
    await git(root, ["commit", "-m", "main advanced"]);

    // Two-dot main feature would include main-only; three-dot must not.
    const changed = await listChangedFiles(root, {
      baseRevision: "main",
      headRevision: "feature",
    });
    assert.ok(
      changed.files.includes("feature-only.ts"),
      `expected feature-only.ts in ${JSON.stringify(changed.files)}`,
    );
    assert.equal(
      changed.files.includes("main-only.ts"),
      false,
      "merge-base range must exclude main-only advances after branch point",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("named --head rejects dirty worktree and mismatched checkout", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-head-"));
  try {
    await initGitRepo(root);
    await writeFile(path.join(root, "package.json"), '{"name":"g"}\n', "utf8");
    await writeFile(path.join(root, "a.ts"), "export const a = 1;\n", "utf8");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "c1"]);
    const { stdout: sha1 } = await execFileAsync(
      "git",
      ["rev-parse", "HEAD"],
      { cwd: root },
    );
    await writeFile(path.join(root, "a.ts"), "export const a = 2;\n", "utf8");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "c2"]);

    await assert.rejects(
      () =>
        assertImpactCompileSource(root, {
          headRevision: sha1.trim(),
        }),
      /working tree only|Check out that revision/i,
    );

    // Dirty HEAD
    await writeFile(path.join(root, "a.ts"), "export const a = 3;\n", "utf8");
    await assert.rejects(
      () => assertImpactCompileSource(root, { headRevision: "HEAD" }),
      /clean working tree/i,
    );

    // filesOnly with --head is rejected (mislabel risk)
    await assert.rejects(
      () =>
        assertImpactCompileSource(root, {
          headRevision: "HEAD",
          filesOnly: true,
        }),
      /Do not combine --files/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("invalid explicit git revisions fail instead of empty impact", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-badrev-"));
  try {
    await initGitRepo(root);
    await writeFile(path.join(root, "package.json"), '{"name":"g"}\n', "utf8");
    await writeFile(path.join(root, "a.ts"), "export const a = 1;\n", "utf8");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "init"]);

    await assert.rejects(
      () =>
        listChangedFiles(root, {
          baseRevision: "definitely-not-a-revision",
          headRevision: "HEAD",
        }),
      /Git change discovery failed|Cannot resolve|unknown revision|bad revision|Needed a single revision/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("files-only mode omits revision labels and rejects combo in listChangedFiles", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-files-"));
  try {
    await initGitRepo(root);
    await writeFile(path.join(root, "package.json"), '{"name":"g"}\n', "utf8");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "init"]);

    const only = await listChangedFiles(root, {
      files: ["src/impact.ts"],
    });
    assert.deepEqual(only.files, ["src/impact.ts"]);
    assert.equal(only.baseRevision, undefined);
    assert.equal(only.headRevision, undefined);

    await assert.rejects(
      () =>
        listChangedFiles(root, {
          files: ["src/impact.ts"],
          headRevision: "master",
        }),
      /Do not combine --files/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("clean guard ignores generated .underdelta output", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-clean-"));
  try {
    await initGitRepo(root);
    await writeFile(path.join(root, "package.json"), '{"name":"g"}\n', "utf8");
    await writeFile(path.join(root, "a.ts"), "export const a = 1;\n", "utf8");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "init"]);

    await mkdir(path.join(root, ".underdelta"), { recursive: true });
    await writeFile(
      path.join(root, ".underdelta", "architecture.json"),
      "{}\n",
      "utf8",
    );

    assert.equal(isIgnorableWorktreePath(".underdelta/architecture.json"), true);
    assert.equal(await isWorktreeClean(root), true);

    const ok = await assertImpactCompileSource(root, {
      headRevision: "HEAD",
      ignoreOutput: path.join(root, ".underdelta"),
    });
    assert.equal(ok.mode, "revision");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("base-only mode uses merge-base not base tip", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-baseonly-"));
  try {
    await initGitRepo(root);
    await writeFile(path.join(root, "package.json"), '{"name":"g"}\n', "utf8");
    await writeFile(path.join(root, "shared.ts"), "export const a = 1;\n", "utf8");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "root"]);
    await git(root, ["branch", "-M", "main"]);

    await git(root, ["checkout", "-b", "feature"]);
    await writeFile(
      path.join(root, "feature-only.ts"),
      "export function feature() { return 1; }\n",
      "utf8",
    );
    await git(root, ["add", "feature-only.ts"]);
    await git(root, ["commit", "-m", "feature work"]);

    await git(root, ["checkout", "main"]);
    await writeFile(
      path.join(root, "main-only.ts"),
      "export function mainline() { return 1; }\n",
      "utf8",
    );
    await git(root, ["add", "main-only.ts"]);
    await git(root, ["commit", "-m", "main advanced"]);

    await git(root, ["checkout", "feature"]);
    const changed = await listChangedFiles(root, {
      baseRevision: "main",
    });
    assert.ok(
      changed.files.includes("feature-only.ts"),
      `expected feature-only in ${JSON.stringify(changed.files)}`,
    );
    assert.equal(
      changed.deletedFiles.includes("main-only.ts"),
      false,
      "main-only must not appear as a deletion via merge-base worktree mode",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
