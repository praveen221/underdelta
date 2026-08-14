import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { analyzeArchitecture } from "./analysis.js";
import { compileRepository } from "./compile.js";
import { computeChangeImpact, type ImpactOptions } from "./impact.js";
import { endpointFacet } from "./projection/http.js";
import { hasFacet, nodeById } from "./reachability.js";
import {
  architectureGraphSchema,
  type ArchitectureGraph,
  type ArchitectureNode,
  type Certainty,
  type Evidence,
  type ImpactReport,
} from "./schema.js";

export type QueryKind = "writes" | "impact" | "unknown";

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

export interface WritesQueryResult {
  query: "writes";
  resource: { id: string; label: string; kind: string };
  writers: WritesHit[];
  limitations: string[];
}

export interface ImpactQueryResult {
  query: "impact";
  report: ImpactReport;
  limitations: string[];
}

export interface UnknownQueryResult {
  query: "unknown";
  unsupported: Array<{ code: string; message: string; file?: string }>;
  issues: Array<{ severity: string; code: string; message: string; file?: string }>;
  unresolvedCalls: Array<{ callee: string; file: string; detail?: string }>;
  limitations: string[];
}

export type QueryResult =
  | WritesQueryResult
  | ImpactQueryResult
  | UnknownQueryResult;

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
): Promise<ArchitectureGraph> {
  if (options.graph) {
    return architectureGraphSchema.parse(
      JSON.parse(await readFile(path.resolve(options.graph), "utf8")),
    );
  }
  const cached = path.resolve(root, options.output ?? ".underdelta", "architecture.json");
  if (!options.rescan) {
    try {
      const info = await stat(cached);
      if (info.isFile()) {
        return architectureGraphSchema.parse(
          JSON.parse(await readFile(cached, "utf8")),
        );
      }
    } catch {
      // compile below
    }
  }
  return compileRepository(root);
}

function resourceCandidates(
  graph: ArchitectureGraph,
  name: string,
): ArchitectureNode[] {
  const needle = name.trim().toLowerCase();
  const scored: Array<{ node: ArchitectureNode; score: number }> = [];
  for (const node of graph.nodes) {
    const label = node.label.toLowerCase();
    const isResource =
      hasFacet(node, "resource") ||
      node.kind === "table" ||
      node.kind === "collection" ||
      node.kind === "database";
    if (!isResource) continue;
    let score = 0;
    if (label === needle) score = 100;
    else if (label.startsWith(needle)) score = 80;
    else if (label.includes(needle)) score = 50;
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
): WritesQueryResult {
  const matches = resourceCandidates(graph, resourceName);
  if (matches.length === 0) {
    throw new Error(
      `No table, collection, or resource matches ${JSON.stringify(resourceName)}.`,
    );
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

  const limitations: string[] = [];
  if (matches.length > 1) {
    limitations.push(
      `Multiple resources matched equally (${matches.map((item) => item.label).join(", ")}); using ${resource.label}.`,
    );
  }
  limitations.push(
    "Only observed/derived writes edges are listed. Missing writers may mean no adapter, not 'nobody writes'.",
  );

  return {
    query: "writes",
    resource: {
      id: resource.id,
      label: resource.label,
      kind: resource.kind,
    },
    writers,
    limitations,
  };
}

export function queryImpactFromGraph(
  graph: ArchitectureGraph,
  changedFiles: string[],
  options: ImpactOptions = {},
): ImpactQueryResult {
  const report = computeChangeImpact(graph, changedFiles, {
    ...(options.baseRevision ? { baseRevision: options.baseRevision } : {}),
    ...(options.headRevision ? { headRevision: options.headRevision } : {}),
  });
  const limitations = [
    "Impact uses the loaded graph (working tree unless you passed --graph).",
    "Unsupported frameworks never appear as typed endpoints.",
  ];
  if (report.unresolved.length > 0) {
    limitations.push(
      `${report.unresolved.length} unresolved/ambiguous call(s) in the change neighborhood.`,
    );
  }
  return { query: "impact", report, limitations };
}

export function queryUnknown(graph: ArchitectureGraph): UnknownQueryResult {
  const analysis = analyzeArchitecture(graph);
  const unresolvedCalls = graph.diagnostics
    .filter((item) => item.code === "call-unresolved" || item.code === "call-ambiguous")
    .slice(0, 40)
    .map((item) => ({
      callee: item.message,
      file: item.evidence?.file ?? ".",
      ...(item.evidence?.detail ? { detail: item.evidence.detail } : {}),
    }));

  return {
    query: "unknown",
    unsupported: analysis.unsupported.map((item) => ({
      code: item.code,
      message: item.message,
      ...(item.evidence?.file ? { file: item.evidence.file } : {}),
    })),
    issues: analysis.issues.map((item) => ({
      severity: item.severity,
      code: item.code,
      message: item.message,
      ...(item.evidence?.file ? { file: item.evidence.file } : {}),
    })),
    unresolvedCalls,
    limitations: [
      "This is everything Underdelta refused to invent. Do not fill these gaps from memory.",
    ],
  };
}

export function formatQueryText(result: QueryResult): string {
  if (result.query === "writes") {
    const lines = [
      `Writes to ${result.resource.kind} ${result.resource.label}`,
      `  Writers: ${result.writers.length}`,
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
    const lines = [`Unknown / unsupported (${result.unsupported.length} frameworks, ${result.issues.length} issues)`];
    for (const item of result.unsupported) {
      lines.push(`  Unsupported: ${item.message}`);
    }
    for (const item of result.issues.slice(0, 20)) {
      lines.push(`  ${item.severity}: ${item.message}`);
    }
    for (const item of result.unresolvedCalls.slice(0, 15)) {
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
  ];
  for (const endpoint of result.report.impact.endpoints.slice(0, 20)) {
    lines.push(`    ${endpoint.method} ${endpoint.path}`);
  }
  for (const limitation of result.limitations) {
    lines.push(`  Limitation: ${limitation}`);
  }
  return lines.join("\n");
}
