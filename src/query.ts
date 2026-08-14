import path from "node:path";
import { compileRepository } from "./compile.js";
import {
  architecturePath,
  isCacheReusable,
  persistArchitectureGraph,
  readArchitectureGraph,
} from "./graphCache.js";
import { computeChangeImpact, type ImpactOptions } from "./impact.js";
import { analyzeArchitecture } from "./analysis.js";
import { endpointFacet } from "./projection/http.js";
import { hasFacet, nodeById } from "./reachability.js";
import type {
  ArchitectureGraph,
  ArchitectureNode,
  Certainty,
  Evidence,
  ImpactReport,
} from "./schema.js";

export type QueryKind = "writes" | "impact" | "unknown";
export type QueryGraphSource = "cache" | "compiled" | "graph-file";

export interface QueryGraphMeta {
  source: QueryGraphSource;
  generatedAt: string;
  revision?: string;
}

export interface LoadedArchitecture {
  graph: ArchitectureGraph;
  source: QueryGraphSource;
}

export interface QueryEvidence {
  file: string;
  line?: number;
  certainty: Certainty;
  extractor?: string;
  detail?: string;
}

export interface WritesHit {
  nodeId: string;
  kind: string;
  label: string;
  method?: string;
  path?: string;
  evidence: QueryEvidence[];
}

export interface ResourceRef {
  id: string;
  label: string;
  kind: string;
}

export interface WritesQueryResult {
  query: "writes";
  resource?: ResourceRef;
  writers: WritesHit[];
  candidates?: ResourceRef[];
  ambiguous?: true;
  limitations: string[];
  graph: QueryGraphMeta;
}

export interface ImpactQueryResult {
  query: "impact";
  report: ImpactReport;
  limitations: string[];
  graph: QueryGraphMeta;
}

export interface UnknownQueryResult {
  query: "unknown";
  unsupported: Array<{ code: string; message: string; file?: string }>;
  issues: Array<{
    severity: string;
    code: string;
    message: string;
    file?: string;
  }>;
  unresolvedCalls: Array<{ callee: string; file: string; detail?: string }>;
  totals: {
    unsupported: number;
    issues: number;
    unresolvedCalls: number;
  };
  truncated: {
    unsupported: boolean;
    issues: boolean;
    unresolvedCalls: boolean;
  };
  limitations: string[];
  graph: QueryGraphMeta;
}

export type QueryResult =
  | WritesQueryResult
  | ImpactQueryResult
  | UnknownQueryResult;

const DEFAULT_UNKNOWN_LIMIT = 40;

function graphMeta(
  graph: ArchitectureGraph,
  source: QueryGraphSource = "compiled",
): QueryGraphMeta {
  const meta: QueryGraphMeta = {
    source,
    generatedAt: graph.generatedAt,
  };
  if (graph.project.revision) meta.revision = graph.project.revision;
  return meta;
}

function compactEvidence(items: Evidence[]): QueryEvidence[] {
  return items.slice(0, 4).map((item) => {
    const out: QueryEvidence = {
      file: item.file,
      certainty: item.certainty,
    };
    if (item.range?.startLine !== undefined) out.line = item.range.startLine;
    if (item.extractor) out.extractor = item.extractor;
    if (item.detail) out.detail = item.detail;
    return out;
  });
}

export async function loadArchitectureGraph(
  root: string,
  options: { graph?: string; output?: string; rescan?: boolean } = {},
): Promise<LoadedArchitecture> {
  if (options.graph) {
    return {
      graph: await readArchitectureGraph(options.graph),
      source: "graph-file",
    };
  }

  const outputDir = path.resolve(root, options.output ?? ".underdelta");
  const cached = architecturePath(outputDir);

  if (!options.rescan) {
    try {
      if (await isCacheReusable(root, outputDir)) {
        return {
          graph: await readArchitectureGraph(cached),
          source: "cache",
        };
      }
    } catch {
      // compile below
    }
  }

  const graph = await compileRepository(root);
  await persistArchitectureGraph(outputDir, graph, root);
  return { graph, source: "compiled" };
}

function isResourceNode(node: ArchitectureNode): boolean {
  return (
    hasFacet(node, "resource") ||
    node.kind === "table" ||
    node.kind === "collection" ||
    node.kind === "database"
  );
}

function resourceRef(node: ArchitectureNode): ResourceRef {
  return { id: node.id, label: node.label, kind: node.kind };
}

function resourceCandidates(
  graph: ArchitectureGraph,
  name: string,
): ArchitectureNode[] {
  const needle = name.trim();
  if (!needle) return [];

  const exactId = graph.nodes.find(
    (node) => isResourceNode(node) && node.id === needle,
  );
  if (exactId) return [exactId];

  const lowered = needle.toLowerCase();
  const scored: Array<{ node: ArchitectureNode; score: number }> = [];
  for (const node of graph.nodes) {
    if (!isResourceNode(node)) continue;
    const label = node.label.toLowerCase();
    let score = 0;
    if (label === lowered) score = 100;
    else if (label.startsWith(lowered)) score = 80;
    else if (label.includes(lowered)) score = 50;
    else continue;
    if (hasFacet(node, "resource")) score += 5;
    scored.push({ node, score });
  }
  scored.sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id));
  if (scored.length === 0) return [];
  const top = scored[0]!.score;
  return scored.filter((item) => item.score === top).map((item) => item.node);
}

function writerHit(node: ArchitectureNode, evidence: Evidence[]): WritesHit {
  const endpoint = endpointFacet(node);
  const hit: WritesHit = {
    nodeId: node.id,
    kind: endpoint ? "endpoint" : node.kind,
    label: node.label,
    evidence: compactEvidence(evidence),
  };
  if (endpoint) {
    hit.method = endpoint.method;
    hit.path = endpoint.path;
    hit.label = `${endpoint.method} ${endpoint.path}`;
  }
  return hit;
}

export function queryWrites(
  graph: ArchitectureGraph,
  resourceName: string,
  source: QueryGraphSource = "compiled",
): WritesQueryResult {
  const matches = resourceCandidates(graph, resourceName);
  const meta = graphMeta(graph, source);
  if (matches.length === 0) {
    throw new Error(
      `No table, collection, or resource matches ${JSON.stringify(resourceName)}.`,
    );
  }
  if (matches.length > 1) {
    return {
      query: "writes",
      ambiguous: true,
      candidates: matches.map(resourceRef),
      writers: [],
      limitations: [
        `Multiple resources matched equally. Re-run with an exact resource id: ${matches.map((item) => item.id).join(", ")}.`,
      ],
      graph: meta,
    };
  }

  const resource = matches[0]!;
  const nodes = nodeById(graph);
  const writers: WritesHit[] = [];
  for (const edge of graph.edges) {
    if (edge.kind !== "writes") continue;
    if (edge.target !== resource.id && edge.source !== resource.id) continue;
    const otherId = edge.target === resource.id ? edge.source : edge.target;
    const other = nodes.get(otherId);
    if (!other) continue;
    writers.push(writerHit(other, edge.evidence));
  }
  writers.sort((a, b) => a.label.localeCompare(b.label) || a.nodeId.localeCompare(b.nodeId));

  return {
    query: "writes",
    resource: resourceRef(resource),
    writers,
    limitations: [
      "Only observed/derived writes edges are listed. Missing writers may mean no adapter, not 'nobody writes'.",
    ],
    graph: meta,
  };
}

function impactLimitation(source: QueryGraphSource): string {
  if (source === "graph-file") {
    return "Impact uses an explicit --graph file. It is not validated against the working tree.";
  }
  if (source === "cache") {
    return "Impact uses a cached graph whose fingerprint matches the working tree and extractor/adapter versions.";
  }
  return "Impact uses a freshly compiled working-tree graph.";
}

export function queryImpactFromGraph(
  graph: ArchitectureGraph,
  changedFiles: string[],
  options: ImpactOptions & { source?: QueryGraphSource } = {},
): ImpactQueryResult {
  const source = options.source ?? "compiled";
  const report = computeChangeImpact(graph, changedFiles, {
    ...(options.baseRevision ? { baseRevision: options.baseRevision } : {}),
    ...(options.headRevision ? { headRevision: options.headRevision } : {}),
  });
  const limitations = [
    impactLimitation(source),
    "Unsupported frameworks never appear as typed endpoints.",
  ];
  if (report.unresolved.length > 0) {
    limitations.push(
      `${report.unresolved.length} unresolved/ambiguous call(s) in the change neighborhood.`,
    );
  }
  return {
    query: "impact",
    report,
    limitations,
    graph: graphMeta(graph, source),
  };
}

function takeLimited<T>(
  items: T[],
  limit: number,
): { items: T[]; total: number; truncated: boolean } {
  const total = items.length;
  if (!Number.isFinite(limit) || limit < 0) {
    return { items, total, truncated: false };
  }
  if (limit === 0) {
    return { items, total, truncated: false };
  }
  return {
    items: items.slice(0, limit),
    total,
    truncated: total > limit,
  };
}

export function queryUnknown(
  graph: ArchitectureGraph,
  options: { limit?: number; source?: QueryGraphSource } = {},
): UnknownQueryResult {
  const analysis = analyzeArchitecture(graph);
  const limit = options.limit ?? DEFAULT_UNKNOWN_LIMIT;
  const unsupported = takeLimited(
    analysis.unsupported.map((item) => ({
      code: item.code,
      message: item.message,
      ...(item.evidence?.file ? { file: item.evidence.file } : {}),
    })),
    limit,
  );
  const issues = takeLimited(
    analysis.issues.map((item) => ({
      severity: item.severity,
      code: item.code,
      message: item.message,
      ...(item.evidence?.file ? { file: item.evidence.file } : {}),
    })),
    limit,
  );
  const unresolved = takeLimited(
    graph.diagnostics
      .filter(
        (item) =>
          item.code === "call-unresolved" || item.code === "call-ambiguous",
      )
      .map((item) => ({
        callee: item.message,
        file: item.evidence?.file ?? ".",
        ...(item.evidence?.detail ? { detail: item.evidence.detail } : {}),
      })),
    limit,
  );

  const limitations = [
    "Listed items are gaps Underdelta refused to invent. Do not fill them from memory.",
  ];
  if (
    unsupported.truncated ||
    issues.truncated ||
    unresolved.truncated
  ) {
    limitations.push(
      `Results are truncated (limit ${limit}). Totals: unsupported=${unsupported.total}, issues=${issues.total}, unresolvedCalls=${unresolved.total}. Re-run with --limit 0 for the full lists.`,
    );
  }

  return {
    query: "unknown",
    unsupported: unsupported.items,
    issues: issues.items,
    unresolvedCalls: unresolved.items,
    totals: {
      unsupported: unsupported.total,
      issues: issues.total,
      unresolvedCalls: unresolved.total,
    },
    truncated: {
      unsupported: unsupported.truncated,
      issues: issues.truncated,
      unresolvedCalls: unresolved.truncated,
    },
    limitations,
    graph: graphMeta(graph, options.source ?? "compiled"),
  };
}

export function formatQueryText(result: QueryResult): string {
  const graphLine = `  Graph: ${result.graph.source} @ ${result.graph.generatedAt}${
    result.graph.revision ? ` (${result.graph.revision.slice(0, 12)})` : ""
  }`;

  if (result.query === "writes") {
    if (result.ambiguous) {
      const lines = [
        "Ambiguous resource match",
        `  Candidates: ${result.candidates?.length ?? 0}`,
        graphLine,
      ];
      for (const candidate of result.candidates ?? []) {
        lines.push(`    - ${candidate.kind} ${candidate.label} (${candidate.id})`);
      }
      for (const limitation of result.limitations) {
        lines.push(`  Limitation: ${limitation}`);
      }
      return lines.join("\n");
    }
    const lines = [
      `Writes to ${result.resource?.kind} ${result.resource?.label}`,
      `  Writers: ${result.writers.length}`,
      graphLine,
    ];
    for (const writer of result.writers) {
      const where = writer.evidence[0]
        ? ` (${writer.evidence[0].file}${writer.evidence[0].line ? `:${writer.evidence[0].line}` : ""})`
        : "";
      lines.push(`    - ${writer.label}${where}`);
    }
    for (const limitation of result.limitations) {
      lines.push(`  Limitation: ${limitation}`);
    }
    return lines.join("\n");
  }
  if (result.query === "unknown") {
    const shown =
      result.unsupported.length +
      result.issues.length +
      result.unresolvedCalls.length;
    const total =
      result.totals.unsupported +
      result.totals.issues +
      result.totals.unresolvedCalls;
    const lines = [
      `Unknown / unsupported (${result.totals.unsupported} frameworks, ${result.totals.issues} issues, ${result.totals.unresolvedCalls} unresolved; showing ${shown} of ${total})`,
      graphLine,
    ];
    for (const item of result.unsupported) {
      lines.push(`  Unsupported: ${item.message}`);
    }
    for (const item of result.issues) {
      lines.push(`  ${item.severity}: ${item.message}`);
    }
    for (const item of result.unresolvedCalls) {
      lines.push(`  Unresolved: ${item.callee} (${item.file})`);
    }
    for (const limitation of result.limitations) {
      lines.push(`  Limitation: ${limitation}`);
    }
    return lines.join("\n");
  }
  const lines = [
    `Change impact for ${result.report.project.name}`,
    `  Endpoints: ${result.report.impact.endpoints.length}`,
    `  Resources: ${result.report.impact.resources.length}`,
    `  Jobs: ${result.report.impact.jobs.length}`,
    graphLine,
  ];
  for (const endpoint of result.report.impact.endpoints.slice(0, 20)) {
    lines.push(`    ${endpoint.method} ${endpoint.path}`);
  }
  for (const limitation of result.limitations) {
    lines.push(`  Limitation: ${limitation}`);
  }
  return lines.join("\n");
}
