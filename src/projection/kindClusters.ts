import { edgeFrom, stableId } from "../graph.js";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  Evidence,
  NodeKind,
} from "../schema.js";
import { dedupeEvidence, projectionEvidence } from "./common.js";

/**
 * Same-kind siblings above this count collapse to a projection hub
 * (`HTTP endpoints (47)`). At the threshold they stay naked — small graphs
 * must not grow a fake 10-endpoint cluster.
 */
export const KIND_CLUSTER_THRESHOLD = 10;

/** Intermediate leaf kinds that explode a neighborhood when dumped as peers. */
export const KIND_CLUSTERABLE = new Set<NodeKind>([
  "route",
  "table",
  "collection",
  "schema",
  "job",
  "cron",
  "queue",
  "topic",
  "page",
  "component",
  "hook",
  "database",
  "service",
]);

const KIND_CLUSTER_TITLES: Partial<Record<NodeKind, string>> = {
  route: "HTTP endpoints",
  table: "Tables",
  collection: "Collections",
  schema: "Schemas",
  job: "Jobs",
  cron: "Cron jobs",
  queue: "Queues",
  topic: "Topics",
  page: "Pages",
  component: "Components",
  hook: "Hooks",
  database: "Databases",
  service: "Services",
};

/** Lowercase nouns for the on-hub density legend (`135 services clustered`). */
const KIND_CLUSTER_NOUNS: Partial<Record<NodeKind, { one: string; many: string }>> = {
  route: { one: "endpoint", many: "endpoints" },
  table: { one: "table", many: "tables" },
  collection: { one: "collection", many: "collections" },
  schema: { one: "schema", many: "schemas" },
  job: { one: "job", many: "jobs" },
  cron: { one: "cron job", many: "cron jobs" },
  queue: { one: "queue", many: "queues" },
  topic: { one: "topic", many: "topics" },
  page: { one: "page", many: "pages" },
  component: { one: "component", many: "components" },
  hook: { one: "hook", many: "hooks" },
  database: { one: "database", many: "databases" },
  service: { one: "service", many: "services" },
};

export function kindClusterSystemKey(
  parentId: string,
  kind: NodeKind,
): string {
  return `kind-cluster:${kind}:${parentId}`;
}

export function kindClusterLabel(kind: NodeKind, count: number): string {
  const title = KIND_CLUSTER_TITLES[kind] ?? `${kind}s`;
  return `${title} (${count})`;
}

export function kindClusterNoun(kind: NodeKind, count: number): string {
  const pair = KIND_CLUSTER_NOUNS[kind];
  if (!pair) return count === 1 ? kind : `${kind}s`;
  return count === 1 ? pair.one : pair.many;
}

/** Hallway caption so a hub does not read as another product system. */
export function kindClusterDensityLegend(kind: NodeKind, count: number): string {
  return `${count} ${kindClusterNoun(kind, count)} clustered`;
}

/**
 * Visual fill 22–100%. Just-over-threshold hubs stay a short hatch;
 * 100+ members fill the track.
 */
export function kindClusterDensityFillPercent(count: number): number {
  const over = Math.max(0, count - KIND_CLUSTER_THRESHOLD);
  return Math.max(22, Math.min(100, Math.round(22 + (over / 90) * 78)));
}

export function isKindClusterHub(
  node: ArchitectureNode | undefined,
): boolean {
  return node?.metadata?.kindCluster === true;
}

export function isKindClusterMember(
  node: ArchitectureNode | undefined,
): boolean {
  return node?.metadata?.kindClusterMember === true;
}

/**
 * Collapse >10 same-kind children under one parent into a semantic hub.
 * Hubs are projection (`projection: semantic`) — not invented product systems.
 * Members keep their evidence; only parentId / contains move.
 */
export function projectKindClusters(args: {
  nodes: Map<string, ArchitectureNode>;
  edges: Map<string, ArchitectureEdge>;
  attach(nodeId: string, systemId: string, evidence: Evidence): void;
}): void {
  const childrenByParent = new Map<string, ArchitectureNode[]>();
  for (const node of args.nodes.values()) {
    if (!node.parentId) continue;
    if (isKindClusterHub(node) || isKindClusterMember(node)) continue;
    if (!KIND_CLUSTERABLE.has(node.kind)) continue;
    if (node.metadata?.projection === "semantic") continue;
    // Already hidden on Intermediate (SQL migrations, overflow routes).
    // Clustering them builds an empty `Schemas (11)` room.
    if (node.metadata?.intermediateOmitted === true) continue;
    const bucket = childrenByParent.get(node.parentId) ?? [];
    bucket.push(node);
    childrenByParent.set(node.parentId, bucket);
  }

  const parentIds = [...childrenByParent.keys()].sort((a, b) =>
    a.localeCompare(b),
  );
  for (const parentId of parentIds) {
    const parent = args.nodes.get(parentId);
    if (!parent || isKindClusterHub(parent)) continue;
    // Domain groups (Users / Articles) are already a named cluster. Wrapping
    // their members in `HTTP endpoints (N)` adds a click without a new story.
    if (parent.metadata?.routeGroup === true) continue;

    const byKind = new Map<NodeKind, ArchitectureNode[]>();
    for (const child of childrenByParent.get(parentId) ?? []) {
      const bucket = byKind.get(child.kind) ?? [];
      bucket.push(child);
      byKind.set(child.kind, bucket);
    }

    const kinds = [...byKind.keys()].sort((a, b) => a.localeCompare(b));
    for (const kind of kinds) {
      const members = (byKind.get(kind) ?? []).sort((a, b) =>
        a.id.localeCompare(b.id),
      );
      if (members.length <= KIND_CLUSTER_THRESHOLD) continue;
      ensureKindCluster(args, parent, kind, members);
    }
  }
}

function ensureKindCluster(
  args: {
    nodes: Map<string, ArchitectureNode>;
    edges: Map<string, ArchitectureEdge>;
    attach(nodeId: string, systemId: string, evidence: Evidence): void;
  },
  parent: ArchitectureNode,
  kind: NodeKind,
  members: ArchitectureNode[],
): void {
  const key = kindClusterSystemKey(parent.id, kind);
  const hubId = stableId("system", key);
  const evidence = dedupeEvidence(
    members.flatMap((member) => member.evidence).slice(0, 8),
  );
  const seed =
    evidence[0] ??
    projectionEvidence(
      members[0]?.evidence[0]?.file ?? ".",
      `Kind cluster of ${members.length} ${kind} nodes`,
    );
  const detail = `Projection cluster of ${members.length} ${kind} nodes under ${parent.label} (not a product system)`;
  let hub = args.nodes.get(hubId);
  if (!hub) {
    hub = {
      id: hubId,
      kind: "system",
      label: kindClusterLabel(kind, members.length),
      technology: "semantic",
      parentId: parent.id,
      metadata: {
        projection: "semantic",
        systemKey: key,
        kindCluster: true,
        clusterKind: kind,
        memberCount: members.length,
        densityLegend: kindClusterDensityLegend(kind, members.length),
        densityFill: kindClusterDensityFillPercent(members.length),
        collapsedInOverview: true,
      },
      evidence: [{ ...seed, detail }],
    };
    args.nodes.set(hub.id, hub);
    const contains = edgeFrom("contains", parent.id, hub.id, seed);
    args.edges.set(contains.id, contains);
  } else {
    hub.label = kindClusterLabel(kind, members.length);
    hub.parentId = parent.id;
    hub.metadata = {
      ...hub.metadata,
      projection: "semantic",
      systemKey: key,
      kindCluster: true,
      clusterKind: kind,
      memberCount: members.length,
      densityLegend: kindClusterDensityLegend(kind, members.length),
      densityFill: kindClusterDensityFillPercent(members.length),
      collapsedInOverview: true,
    };
    hub.evidence = dedupeEvidence([
      ...hub.evidence,
      { ...seed, detail },
    ]);
    args.nodes.set(hub.id, hub);
  }

  for (const member of members) {
    const memberEvidence = member.evidence[0] ?? seed;
    args.attach(member.id, hub.id, memberEvidence);
    const updated = args.nodes.get(member.id);
    if (!updated || updated.parentId !== hub.id) continue;
    updated.metadata = {
      ...updated.metadata,
      kindClusterMember: true,
      kindCluster: key,
    };
    args.nodes.set(updated.id, updated);
  }

  hub.evidence = dedupeEvidence(hub.evidence);
  args.nodes.set(hub.id, hub);
}
