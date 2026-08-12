import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ArchitectureGraph, Certainty, ImpactReport } from "./schema.js";
import {
  buildForwardAdjacency,
  buildReverseAdjacency,
  collectCallMetrics,
  findPaths,
  hasFacet,
  isProductAnchor,
  nodeById,
  reachableIds,
  reverseReachableIds,
  symbolsInFiles,
  systemsOwningNodes,
  unresolvedFromDiagnostics,
  type ReachabilityPath,
} from "./reachability.js";

const execFileAsync = promisify(execFile);

export interface ImpactOptions {
  /** Files changed (repo-relative). If omitted, derived from git. */
  files?: string[];
  baseRevision?: string;
  headRevision?: string;
  /** Prefer working tree vs HEAD when no base/head. Default true. */
  worktree?: boolean;
  maxDepth?: number;
  maxPaths?: number;
}

export interface ChangedFilesResult {
  files: string[];
  /** Paths deleted between base and head (not present in head tree). */
  deletedFiles: string[];
  baseRevision?: string;
  headRevision?: string;
  /** True when analyzing dirty worktree (includes untracked). */
  worktree: boolean;
}

function splitLines(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replaceAll("\\", "/"));
}

async function gitNameOnly(
  root: string,
  args: string[],
): Promise<string[]> {
  const { stdout } = await execFileAsync("git", args, { cwd: root });
  return splitLines(stdout);
}

/** Resolve a revision to a full commit SHA. */
export async function resolveGitSha(
  root: string,
  revision: string,
): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "--verify", revision],
    { cwd: root },
  );
  return stdout.trim();
}

/**
 * Paths that count as "source dirtiness" for clean-HEAD impact.
 * Ignores Underdelta output dirs and other known scan artifacts so a prior
 * `scan`/`impact` does not block the next clean revision run.
 */
export function isIgnorableWorktreePath(
  relativePath: string,
  ignorePrefixes: string[] = [],
): boolean {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\.\//, "");
  if (
    normalized === ".underdelta" ||
    normalized.startsWith(".underdelta/") ||
    normalized.startsWith(".underdelta-") ||
    normalized === ".dogfood-scans" ||
    normalized.startsWith(".dogfood-scans/") ||
    normalized === ".dogfood-repos" ||
    normalized.startsWith(".dogfood-repos/")
  ) {
    return true;
  }
  for (const prefix of ignorePrefixes) {
    const clean = prefix.replaceAll("\\", "/").replace(/\/$/, "");
    if (!clean) continue;
    if (normalized === clean || normalized.startsWith(`${clean}/`)) {
      return true;
    }
  }
  return false;
}

/** Parse `git status --porcelain` paths (supports rename "old -> new"). */
export function porcelainPaths(stdout: string): string[] {
  const paths: string[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    // XY PATH or XY ORIG -> PATH
    const body = line.length >= 3 ? line.slice(3) : line.trim();
    if (body.includes(" -> ")) {
      const parts = body.split(" -> ");
      const next = parts.at(-1)?.trim();
      if (next) paths.push(next.replaceAll("\\", "/"));
      continue;
    }
    paths.push(body.trim().replaceAll("\\", "/").replace(/^"/, "").replace(/"$/, ""));
  }
  return paths;
}

export async function isWorktreeClean(
  root: string,
  options: { ignorePrefixes?: string[] } = {},
): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["status", "--porcelain"],
      { cwd: root },
    );
    if (!stdout.trim()) return true;
    const remaining = porcelainPaths(stdout).filter(
      (entry) => !isIgnorableWorktreePath(entry, options.ignorePrefixes ?? []),
    );
    return remaining.length === 0;
  } catch {
    return false;
  }
}

/**
 * Impact always compiles the working tree today. Named `--head` revisions are
 * only valid when HEAD points at that revision and the worktree is clean —
 * otherwise current-tree facts would be mislabeled. Historical tree materialization
 * is not implemented yet.
 *
 * `--files` must not be combined with `--base`/`--head` (mislabeled graphs).
 */
export async function assertImpactCompileSource(
  root: string,
  options: {
    headRevision?: string;
    baseRevision?: string;
    filesOnly?: boolean;
    /** Absolute or repo-relative output dir to ignore in clean checks. */
    ignoreOutput?: string;
  },
): Promise<{ mode: "worktree" | "revision"; headSha?: string }> {
  if (options.filesOnly && (options.headRevision || options.baseRevision)) {
    throw new Error(
      `Do not combine --files with --base/--head. ` +
        `--files analyzes the current working tree without git revision labels; ` +
        `omit --base/--head, or drop --files to use a git range.`,
    );
  }

  if (options.filesOnly || !options.headRevision) {
    return { mode: "worktree" };
  }

  const head = options.headRevision;
  if (
    head === "worktree" ||
    head.startsWith("worktree-vs-") ||
    head === "WORKTREE"
  ) {
    return { mode: "worktree" };
  }

  let headSha: string;
  let checkoutSha: string;
  try {
    headSha = await resolveGitSha(root, head);
    checkoutSha = await resolveGitSha(root, "HEAD");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot resolve --head ${head} for impact analysis: ${message}`,
    );
  }

  if (headSha !== checkoutSha) {
    throw new Error(
      `Impact analyzes the working tree only until historical graphs exist. ` +
        `--head ${head} resolves to ${headSha.slice(0, 12)}, but HEAD is ${checkoutSha.slice(0, 12)}. ` +
        `Check out that revision (cleanly) and re-run, or pass --files alone (no --base/--head).`,
    );
  }

  const ignorePrefixes: string[] = [];
  if (options.ignoreOutput) {
    const absolute = options.ignoreOutput;
    // Prefer repo-relative prefix when output is under root.
    if (absolute.startsWith(root)) {
      const rel = absolute.slice(root.length).replace(/^\//, "").replaceAll("\\", "/");
      if (rel) ignorePrefixes.push(rel);
    } else {
      ignorePrefixes.push(absolute.replaceAll("\\", "/"));
    }
  }

  const clean = await isWorktreeClean(root, { ignorePrefixes });
  if (!clean) {
    throw new Error(
      `Impact with --head ${head} requires a clean working tree so graph facts match that revision. ` +
        `Commit/stash local source changes, or omit --head to analyze the dirty worktree (including untracked files). ` +
        `Generated Underdelta output directories are ignored.`,
    );
  }

  return { mode: "revision", headSha };
}

function gitErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const withStderr = error as Error & { stderr?: string | Buffer };
  const stderr =
    typeof withStderr.stderr === "string"
      ? withStderr.stderr
      : withStderr.stderr
        ? withStderr.stderr.toString("utf8")
        : "";
  return (stderr || error.message).trim() || error.message;
}

async function mergeBase(root: string, base: string, head: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["merge-base", base, head],
      { cwd: root },
    );
    return stdout.trim();
  } catch (error) {
    throw new Error(
      `Cannot compute merge-base(${base}, ${head}): ${gitErrorMessage(error)}`,
    );
  }
}

export async function listChangedFiles(
  root: string,
  options: ImpactOptions = {},
): Promise<ChangedFilesResult> {
  if (options.files?.length) {
    if (options.baseRevision || options.headRevision) {
      throw new Error(
        `Do not combine --files with --base/--head (avoids mislabeling a worktree graph).`,
      );
    }
    return {
      files: options.files.map((file) => file.replaceAll("\\", "/")),
      deletedFiles: [],
      worktree: true,
    };
  }

  const base = options.baseRevision;
  const head = options.headRevision;
  const explicitRevision = Boolean(base || head);

  const run = async (): Promise<ChangedFilesResult> => {
    if (base && head) {
      // Validate both revs first so invalid names never look like "no changes".
      await resolveGitSha(root, base);
      await resolveGitSha(root, head);
      // Triple-dot: merge-base(base, head)..head — PR range semantics.
      const range = `${base}...${head}`;
      const files = await gitNameOnly(root, [
        "diff",
        "--name-only",
        "--diff-filter=ACMR",
        range,
      ]);
      const deletedFiles = await gitNameOnly(root, [
        "diff",
        "--name-only",
        "--diff-filter=D",
        range,
      ]);
      return {
        files,
        deletedFiles,
        baseRevision: base,
        headRevision: head,
        worktree: false,
      };
    }
    if (base) {
      await resolveGitSha(root, base);
      // merge-base(base, HEAD) vs worktree — not tip of base vs worktree.
      const ancestor = await mergeBase(root, base, "HEAD");
      const files = await gitNameOnly(root, [
        "diff",
        "--name-only",
        "--diff-filter=ACMR",
        ancestor,
      ]);
      const deletedFiles = await gitNameOnly(root, [
        "diff",
        "--name-only",
        "--diff-filter=D",
        ancestor,
      ]);
      const untracked = await gitNameOnly(root, [
        "ls-files",
        "--others",
        "--exclude-standard",
      ]);
      return {
        files: [...new Set([...files, ...untracked])],
        deletedFiles,
        baseRevision: base,
        headRevision: "worktree",
        worktree: true,
      };
    }

    // Default: dirty worktree vs HEAD, including untracked.
    // Not an explicit revision mode — empty on non-git is ok if clearly worktree.
    const unstaged = await gitNameOnly(root, [
      "diff",
      "--name-only",
      "--diff-filter=ACMR",
      "HEAD",
    ]);
    const staged = await gitNameOnly(root, [
      "diff",
      "--name-only",
      "--diff-filter=ACMR",
      "--cached",
    ]);
    const deletedUnstaged = await gitNameOnly(root, [
      "diff",
      "--name-only",
      "--diff-filter=D",
      "HEAD",
    ]);
    const deletedStaged = await gitNameOnly(root, [
      "diff",
      "--name-only",
      "--diff-filter=D",
      "--cached",
    ]);
    const untracked = await gitNameOnly(root, [
      "ls-files",
      "--others",
      "--exclude-standard",
    ]);
    const files = new Set<string>([...unstaged, ...staged, ...untracked]);
    const deletedFiles = [
      ...new Set([...deletedUnstaged, ...deletedStaged]),
    ];
    let headRevision = "worktree";
    try {
      const { stdout: rev } = await execFileAsync(
        "git",
        ["rev-parse", "--short", "HEAD"],
        { cwd: root },
      );
      headRevision = `worktree-vs-${rev.trim()}`;
    } catch {
      // not a git repo
    }
    return { files: [...files], deletedFiles, headRevision, worktree: true };
  };

  try {
    return await run();
  } catch (error) {
    if (explicitRevision) {
      throw new Error(
        `Git change discovery failed for explicit revision options: ${gitErrorMessage(error)}`,
      );
    }
    // Default mode outside a git repo: empty change set, worktree graph.
    return {
      files: [],
      deletedFiles: [],
      worktree: true,
    };
  }
}

function endpointInfo(node: {
  id: string;
  label: string;
  metadata: Record<string, unknown>;
  semantics?: ArchitectureGraph["nodes"][number]["semantics"];
}): { method: string; path: string; nodeId: string; label?: string } {
  const facet = node.semantics?.find((item) => item.kind === "endpoint");
  if (facet && facet.kind === "endpoint") {
    return {
      method: facet.method,
      path: facet.path,
      nodeId: node.id,
      label: node.label,
    };
  }
  const method =
    typeof node.metadata.method === "string" ? node.metadata.method : "ANY";
  const path =
    typeof node.metadata.path === "string"
      ? node.metadata.path
      : node.label.replace(/^[A-Z]+\s+/, "") || node.label;
  return { method, path, nodeId: node.id, label: node.label };
}

/** Downstream: changed symbol → product anchors. */
function pickDownstreamPaths(
  graph: ArchitectureGraph,
  symbolIds: string[],
  neighborhood: Set<string>,
  maxPaths: number,
): ReachabilityPath[] {
  const paths: ReachabilityPath[] = [];
  for (const symbolId of symbolIds) {
    if (paths.length >= maxPaths) break;
    const found = findPaths(
      graph,
      symbolId,
      (node) => isProductAnchor(node) && neighborhood.has(node.id),
      { maxDepth: 8, maxPaths: 5 },
    );
    for (const path of found) {
      paths.push(path);
      if (paths.length >= maxPaths) break;
    }
  }
  return paths;
}

/**
 * Upstream: product anchors that reach changed symbols via reverse BFS.
 * Serialize forward paths from those anchors to the seeds so claims have evidence.
 */
function pickUpstreamPaths(
  graph: ArchitectureGraph,
  seedIds: string[],
  neighborhood: Set<string>,
  maxPaths: number,
): ReachabilityPath[] {
  const seedSet = new Set(seedIds);
  const nodes = nodeById(graph);
  const anchors: string[] = [];
  for (const id of neighborhood) {
    if (seedSet.has(id)) continue;
    const node = nodes.get(id);
    if (node && isProductAnchor(node)) anchors.push(id);
  }

  const paths: ReachabilityPath[] = [];
  for (const anchorId of anchors) {
    if (paths.length >= maxPaths) break;
    const found = findPaths(
      graph,
      anchorId,
      (node) => seedSet.has(node.id),
      { maxDepth: 8, maxPaths: 3 },
    );
    for (const path of found) {
      paths.push(path);
      if (paths.length >= maxPaths) break;
    }
  }
  return paths;
}

export function computeChangeImpact(
  graph: ArchitectureGraph,
  changedFiles: string[],
  options: {
    baseRevision?: string;
    headRevision?: string;
    deletedFiles?: string[];
    maxDepth?: number;
    maxPaths?: number;
  } = {},
): ImpactReport {
  const maxDepth = options.maxDepth ?? 12;
  const maxPaths = options.maxPaths ?? 24;
  const files = changedFiles.map((file) => file.replaceAll("\\", "/"));
  const deletedFiles = (options.deletedFiles ?? []).map((file) =>
    file.replaceAll("\\", "/"),
  );
  const changedSymbols = symbolsInFiles(graph, files);
  const seedIds = changedSymbols.map((node) => node.id);

  const forward = buildForwardAdjacency(graph);
  const reverse = buildReverseAdjacency(graph);
  const downstream = reachableIds(forward, seedIds, maxDepth);
  const upstream = reverseReachableIds(reverse, seedIds, maxDepth);
  const neighborhood = new Set<string>([...downstream, ...upstream]);

  const nodes = nodeById(graph);
  const endpoints: ImpactReport["impact"]["endpoints"] = [];
  const resources: ImpactReport["impact"]["resources"] = [];
  const jobs: ImpactReport["impact"]["jobs"] = [];
  const queues: ImpactReport["impact"]["queues"] = [];
  const seen = new Set<string>();

  for (const id of neighborhood) {
    const node = nodes.get(id);
    if (!node) continue;
    if (seen.has(id)) continue;

    if (node.kind === "route" || hasFacet(node, "endpoint")) {
      seen.add(id);
      endpoints.push(endpointInfo(node));
      continue;
    }
    if (
      node.kind === "table" ||
      node.kind === "collection" ||
      node.kind === "database" ||
      hasFacet(node, "resource")
    ) {
      seen.add(id);
      resources.push({
        label: node.label,
        kind: node.kind,
        nodeId: node.id,
      });
      continue;
    }
    if (
      node.kind === "job" ||
      node.kind === "cron" ||
      hasFacet(node, "job") ||
      hasFacet(node, "trigger")
    ) {
      seen.add(id);
      jobs.push({ label: node.label, nodeId: node.id });
      continue;
    }
    if (node.kind === "queue" || node.kind === "topic") {
      seen.add(id);
      queues.push({ label: node.label, nodeId: node.id });
    }
  }

  const systems = systemsOwningNodes(graph, neighborhood).map((system) => ({
    id: system.id,
    label: system.label,
  }));

  const half = Math.max(1, Math.floor(maxPaths / 2));
  const downstreamPaths = pickDownstreamPaths(
    graph,
    seedIds,
    neighborhood,
    half,
  );
  const upstreamPaths = pickUpstreamPaths(
    graph,
    seedIds,
    neighborhood,
    maxPaths - downstreamPaths.length,
  );
  const paths = [...upstreamPaths, ...downstreamPaths];

  const evidenceCount: Record<Certainty, number> = {
    observed: 0,
    derived: 0,
    inferred: 0,
  };
  for (const edge of graph.edges) {
    if (!neighborhood.has(edge.source) && !neighborhood.has(edge.target)) {
      continue;
    }
    for (const evidence of edge.evidence) {
      evidenceCount[evidence.certainty] += 1;
    }
  }

  const metrics = collectCallMetrics(graph);
  const unresolved = unresolvedFromDiagnostics(graph.diagnostics).filter(
    (item) =>
      files.includes(item.file.replaceAll("\\", "/")) ||
      (item.fromSymbolId !== undefined && seedIds.includes(item.fromSymbolId)),
  );

  // Highlight: changed symbols + product anchors in neighborhood + path nodes
  const highlightNodeIds = new Set<string>(seedIds);
  for (const id of neighborhood) {
    const node = nodes.get(id);
    if (node && isProductAnchor(node)) highlightNodeIds.add(id);
  }
  for (const path of paths) {
    highlightNodeIds.add(path.fromSymbolId);
    for (const step of path.steps) highlightNodeIds.add(step.to);
  }
  for (const system of systems) highlightNodeIds.add(system.id);

  const report: ImpactReport = {
    schemaVersion: "0.1",
    project: {
      name: graph.project.name,
      root: graph.project.root,
      ...(options.baseRevision ? { baseRevision: options.baseRevision } : {}),
      ...(options.headRevision
        ? { headRevision: options.headRevision }
        : graph.project.revision
          ? { headRevision: graph.project.revision }
          : {}),
    },
    changed: {
      files,
      deletedFiles,
      symbols: changedSymbols.map((node) => ({
        id: node.id,
        label: node.label,
        kind: node.kind,
      })),
    },
    impact: {
      endpoints,
      resources,
      jobs,
      queues,
      systems,
    },
    paths: paths.map((path) => ({
      fromSymbolId: path.fromSymbolId,
      steps: path.steps,
    })),
    evidenceCount,
    unresolved,
    metrics,
    highlightNodeIds: [...highlightNodeIds],
  };

  return report;
}

export function formatImpactLines(report: ImpactReport): string[] {
  const lines: string[] = [];
  lines.push(`Change impact for ${report.project.name}`);
  if (report.project.baseRevision || report.project.headRevision) {
    lines.push(
      `  Revisions: ${report.project.baseRevision ?? "?"} → ${report.project.headRevision ?? "?"}`,
    );
  }
  lines.push(
    `  Changed files: ${report.changed.files.length || "(none detected)"}`,
  );
  for (const file of report.changed.files.slice(0, 20)) {
    lines.push(`    - ${file}`);
  }
  if (report.changed.files.length > 20) {
    lines.push(`    … ${report.changed.files.length - 20} more`);
  }
  if (report.changed.deletedFiles.length > 0) {
    lines.push(
      `  Deleted files (not in head graph; need base compile for symbols): ${report.changed.deletedFiles.length}`,
    );
    for (const file of report.changed.deletedFiles.slice(0, 10)) {
      lines.push(`    - ${file}`);
    }
  }
  lines.push(`  Changed symbols: ${report.changed.symbols.length}`);
  for (const symbol of report.changed.symbols.slice(0, 15)) {
    lines.push(`    - ${symbol.kind} ${symbol.label}`);
  }

  lines.push("  Potential impact:");
  if (
    report.impact.endpoints.length === 0 &&
    report.impact.resources.length === 0 &&
    report.impact.jobs.length === 0 &&
    report.impact.queues.length === 0
  ) {
    lines.push(
      "    (no product anchors reached — check call resolution coverage)",
    );
  }
  for (const endpoint of report.impact.endpoints) {
    lines.push(`    ${endpoint.method} ${endpoint.path}`);
  }
  for (const resource of report.impact.resources) {
    lines.push(`    ${resource.kind} ${resource.label}`);
  }
  for (const job of report.impact.jobs) {
    lines.push(`    job ${job.label}`);
  }
  for (const queue of report.impact.queues) {
    lines.push(`    queue ${queue.label}`);
  }
  if (report.impact.systems.length > 0) {
    lines.push(
      `  Systems: ${report.impact.systems.map((system) => system.label).join(", ")}`,
    );
  }

  const evidenceTotal =
    report.evidenceCount.observed +
    report.evidenceCount.derived +
    report.evidenceCount.inferred;
  lines.push(
    `  Evidence links (neighborhood): ${evidenceTotal} observed=${report.evidenceCount.observed} derived=${report.evidenceCount.derived} inferred=${report.evidenceCount.inferred}`,
  );
  lines.push(
    `  Call metrics (repo): resolved=${report.metrics.callsResolved} unresolved=${report.metrics.callsUnresolved} ambiguous=${report.metrics.callsAmbiguous}`,
  );

  if (report.unresolved.length > 0) {
    lines.push("  Unresolved / ambiguous:");
    for (const item of report.unresolved.slice(0, 15)) {
      lines.push(`    - ${item.callee} (${item.file})`);
    }
  }

  if (report.paths.length > 0) {
    lines.push("  Sample paths:");
    for (const path of report.paths.slice(0, 8)) {
      const chain = path.steps
        .map(
          (step) =>
            `${step.edgeKind}→${step.to.split(":").slice(0, 2).join(":")}`,
        )
        .join(" ");
      lines.push(
        `    - ${path.fromSymbolId.split(":").slice(0, 3).join(":")} ${chain}`,
      );
    }
  }

  return lines;
}
