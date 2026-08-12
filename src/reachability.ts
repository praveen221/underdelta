import type {
  ArchitectureEdge,
  ArchitectureGraph,
  ArchitectureNode,
  Certainty,
  Diagnostic,
  EdgeKind,
} from "./schema.js";

/** Edges that carry product/semantic reachability (not contains hierarchy alone). */
export const REACHABILITY_EDGE_KINDS = new Set<EdgeKind>([
  "calls",
  "imports",
  "routes-to",
  "reads",
  "writes",
  "queries",
  "publishes",
  "consumes",
  "schedules",
  "handled-by",
  "triggers",
  "uses",
  "renders",
  "depends-on",
  "flows-to",
  "exposes",
]);

export interface CallMetrics {
  callsResolved: number;
  callsUnresolved: number;
  callsAmbiguous: number;
}

export interface PathStep {
  edgeKind: string;
  to: string;
  certainty: Certainty;
}

export interface ReachabilityPath {
  fromSymbolId: string;
  steps: PathStep[];
}

export function collectCallMetrics(graph: ArchitectureGraph): CallMetrics {
  let callsResolved = 0;
  for (const edge of graph.edges) {
    if (edge.kind === "calls") callsResolved += 1;
  }
  let callsUnresolved = 0;
  let callsAmbiguous = 0;
  for (const diagnostic of graph.diagnostics) {
    if (diagnostic.code === "call-unresolved") callsUnresolved += 1;
    if (diagnostic.code === "call-ambiguous") callsAmbiguous += 1;
  }
  return { callsResolved, callsUnresolved, callsAmbiguous };
}

export function nodeById(graph: ArchitectureGraph): Map<string, ArchitectureNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function edgeCertainty(edge: ArchitectureEdge): Certainty {
  return edge.evidence[0]?.certainty ?? "derived";
}

export function buildForwardAdjacency(
  graph: ArchitectureGraph,
  kinds: Set<EdgeKind> = REACHABILITY_EDGE_KINDS,
): Map<string, ArchitectureEdge[]> {
  const adjacency = new Map<string, ArchitectureEdge[]>();
  for (const edge of graph.edges) {
    if (!kinds.has(edge.kind)) continue;
    const list = adjacency.get(edge.source) ?? [];
    list.push(edge);
    adjacency.set(edge.source, list);
  }
  return adjacency;
}

export function buildReverseAdjacency(
  graph: ArchitectureGraph,
  kinds: Set<EdgeKind> = REACHABILITY_EDGE_KINDS,
): Map<string, ArchitectureEdge[]> {
  const adjacency = new Map<string, ArchitectureEdge[]>();
  for (const edge of graph.edges) {
    if (!kinds.has(edge.kind)) continue;
    const list = adjacency.get(edge.target) ?? [];
    list.push(edge);
    adjacency.set(edge.target, list);
  }
  return adjacency;
}

export function hasFacet(node: ArchitectureNode, kind: string): boolean {
  return node.semantics?.some((facet) => facet.kind === kind) === true;
}

export function isProductAnchor(node: ArchitectureNode): boolean {
  if (node.kind === "system" || node.kind === "route" || node.kind === "queue" || node.kind === "topic") {
    return true;
  }
  if (node.kind === "table" || node.kind === "collection" || node.kind === "database") {
    return true;
  }
  if (node.kind === "job" || node.kind === "cron") return true;
  if (hasFacet(node, "endpoint") || hasFacet(node, "resource") || hasFacet(node, "trigger") || hasFacet(node, "job")) {
    return true;
  }
  return false;
}

/** BFS from seeds following forward edges; returns visited node ids. */
export function reachableIds(
  adjacency: Map<string, ArchitectureEdge[]>,
  seeds: Iterable<string>,
  maxDepth = 12,
): Set<string> {
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [];
  for (const id of seeds) {
    visited.add(id);
    queue.push({ id, depth: 0 });
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;
    for (const edge of adjacency.get(current.id) ?? []) {
      const next = edge.target;
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push({ id: next, depth: current.depth + 1 });
    }
  }
  return visited;
}

/** BFS following reverse edges (who can reach seeds). */
export function reverseReachableIds(
  reverseAdjacency: Map<string, ArchitectureEdge[]>,
  seeds: Iterable<string>,
  maxDepth = 12,
): Set<string> {
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [];
  for (const id of seeds) {
    visited.add(id);
    queue.push({ id, depth: 0 });
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;
    for (const edge of reverseAdjacency.get(current.id) ?? []) {
      // Reverse: edge.target is current; edge.source can reach us.
      const next = edge.source;
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push({ id: next, depth: current.depth + 1 });
    }
  }
  return visited;
}

/**
 * Find simple paths from `fromId` until `isGoal` matches, bounded by depth.
 * Precision-first: limited branching, no cycles.
 */
export function findPaths(
  graph: ArchitectureGraph,
  fromId: string,
  isGoal: (node: ArchitectureNode) => boolean,
  options: { maxDepth?: number; maxPaths?: number } = {},
): ReachabilityPath[] {
  const maxDepth = options.maxDepth ?? 8;
  const maxPaths = options.maxPaths ?? 20;
  const nodes = nodeById(graph);
  const adjacency = buildForwardAdjacency(graph);
  const paths: ReachabilityPath[] = [];

  const walk = (
    current: string,
    steps: PathStep[],
    seen: Set<string>,
  ): void => {
    if (paths.length >= maxPaths) return;
    const node = nodes.get(current);
    if (node && steps.length > 0 && isGoal(node)) {
      paths.push({ fromSymbolId: fromId, steps: [...steps] });
      return;
    }
    if (steps.length >= maxDepth) return;
    for (const edge of adjacency.get(current) ?? []) {
      if (seen.has(edge.target)) continue;
      const nextSeen = new Set(seen);
      nextSeen.add(edge.target);
      steps.push({
        edgeKind: edge.kind,
        to: edge.target,
        certainty: edgeCertainty(edge),
      });
      walk(edge.target, steps, nextSeen);
      steps.pop();
      if (paths.length >= maxPaths) return;
    }
  };

  walk(fromId, [], new Set([fromId]));
  return paths;
}

export function systemsOwningNodes(
  graph: ArchitectureGraph,
  nodeIds: Iterable<string>,
): ArchitectureNode[] {
  const nodes = nodeById(graph);
  const systems = new Map<string, ArchitectureNode>();
  const idSet = new Set(nodeIds);

  for (const edge of graph.edges) {
    if (edge.kind !== "contains") continue;
    const parent = nodes.get(edge.source);
    const child = nodes.get(edge.target);
    if (!parent || parent.kind !== "system") continue;
    if (idSet.has(edge.target) || (child && idSet.has(child.id))) {
      systems.set(parent.id, parent);
    }
  }

  // Also: if a selected id is itself a system.
  for (const id of idSet) {
    const node = nodes.get(id);
    if (node?.kind === "system") systems.set(node.id, node);
  }

  return [...systems.values()];
}

export function symbolsInFiles(
  graph: ArchitectureGraph,
  files: Iterable<string>,
): ArchitectureNode[] {
  const fileSet = new Set(
    [...files].map((file) => file.replaceAll("\\", "/")),
  );
  const symbolKinds = new Set([
    "function",
    "component",
    "hook",
    "service",
    "module",
    "route",
    "job",
    "cron",
  ]);
  return graph.nodes.filter((node) => {
    if (!symbolKinds.has(node.kind) && !hasFacet(node, "symbol")) return false;
    return node.evidence.some((item) =>
      fileSet.has(item.file.replaceAll("\\", "/")),
    );
  });
}

export function unresolvedFromDiagnostics(
  diagnostics: Diagnostic[],
): Array<{ fromSymbolId?: string; callee: string; file: string; detail?: string }> {
  const out: Array<{
    fromSymbolId?: string;
    callee: string;
    file: string;
    detail?: string;
  }> = [];
  for (const diagnostic of diagnostics) {
    if (
      diagnostic.code !== "call-unresolved" &&
      diagnostic.code !== "call-ambiguous"
    ) {
      continue;
    }
    const file = diagnostic.evidence?.file ?? ".";
    const detail = diagnostic.message;
    const calleeMatch = /call to [`']?([^`'\s]+)/i.exec(diagnostic.message);
    const callee = calleeMatch?.[1] ?? diagnostic.message;
    const from =
      typeof diagnostic.evidence?.detail === "string" &&
      diagnostic.evidence.detail.startsWith("from:")
        ? diagnostic.evidence.detail.slice("from:".length)
        : undefined;
    const entry: {
      fromSymbolId?: string;
      callee: string;
      file: string;
      detail?: string;
    } = { callee, file, detail };
    if (from) entry.fromSymbolId = from;
    out.push(entry);
  }
  return out;
}

/** Path query helpers for product anchors. */
export function pathsFromSymbolToResources(
  graph: ArchitectureGraph,
  symbolId: string,
): ReachabilityPath[] {
  return findPaths(
    graph,
    symbolId,
    (node) =>
      node.kind === "table" ||
      node.kind === "collection" ||
      node.kind === "database" ||
      hasFacet(node, "resource"),
  );
}

export function pathsFromSymbolToQueues(
  graph: ArchitectureGraph,
  symbolId: string,
): ReachabilityPath[] {
  return findPaths(
    graph,
    symbolId,
    (node) => node.kind === "queue" || node.kind === "topic",
  );
}

export function pathsFromEndpointsToResources(
  graph: ArchitectureGraph,
): ReachabilityPath[] {
  const paths: ReachabilityPath[] = [];
  for (const node of graph.nodes) {
    const isEndpoint =
      node.kind === "route" || hasFacet(node, "endpoint");
    if (!isEndpoint) continue;
    paths.push(...pathsFromSymbolToResources(graph, node.id));
  }
  return paths;
}
