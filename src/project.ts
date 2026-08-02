import { edgeFrom, stableId } from "./graph.js";
import {
  architectureGraphSchema,
  type ArchitectureGraph,
  type ArchitectureNode,
  type Evidence,
  type NodeKind,
} from "./schema.js";

interface SystemRole {
  key: string;
  label: string;
  kind: NodeKind;
}

const preferredFlows: Array<[string, string]> = [
  ["cli", "compile"],
  ["compile", "extractors"],
  ["extractors", "graph"],
  ["graph", "viewer"],
  ["schema", "graph"],
  ["schema", "extractors"],
  ["api", "pipelines"],
  ["api", "workers"],
  ["api", "data"],
  ["jobs", "data"],
  ["pipelines", "data"],
  ["workers", "data"],
  ["viewer", "api"],
];

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function isFileModule(node: ArchitectureNode): boolean {
  return (
    node.kind === "module" &&
    /\.[cm]?[jt]sx?$/i.test(normalizePath(node.qualifiedName ?? node.label))
  );
}

function modulePath(node: ArchitectureNode): string {
  return normalizePath(node.qualifiedName ?? node.label);
}

export function inferSystemRole(moduleFile: string): SystemRole | undefined {
  const file = normalizePath(moduleFile).toLowerCase();

  if (file.includes("/extractors/") || /(^|\/)extractor\.[cm]?[jt]sx?$/.test(file)) {
    return { key: "extractors", label: "Extractors", kind: "system" };
  }
  if (/(^|\/)cli\.[cm]?[jt]sx?$/.test(file)) {
    return { key: "cli", label: "CLI", kind: "system" };
  }
  if (/(^|\/)compile\.[cm]?[jt]sx?$/.test(file)) {
    return { key: "compile", label: "Compile pipeline", kind: "pipeline" };
  }
  if (/(^|\/)viewer\.[cm]?[jt]sx?$/.test(file)) {
    return { key: "viewer", label: "Viewer", kind: "ui" };
  }
  if (file.includes("/ui/") || file.includes("/components/")) {
    return { key: "ui", label: "UI", kind: "ui" };
  }
  if (/(^|\/)schema\.[cm]?[jt]sx?$/.test(file)) {
    return { key: "schema", label: "Schema contract", kind: "system" };
  }
  if (/(^|\/)graph\.[cm]?[jt]sx?$/.test(file)) {
    return { key: "graph", label: "Graph assembly", kind: "system" };
  }
  if (
    /(^|\/)(server|app|routes?)\.[cm]?[jt]sx?$/.test(file) ||
    file.includes("/routes/") ||
    file.includes("/api/")
  ) {
    return { key: "api", label: "HTTP API", kind: "api" };
  }
  if (/(^|\/)jobs?\.[cm]?[jt]sx?$/.test(file) || file.includes("/jobs/")) {
    return { key: "jobs", label: "Scheduled jobs", kind: "system" };
  }
  if (/(^|\/)workers?\.[cm]?[jt]sx?$/.test(file) || file.includes("/workers/")) {
    return { key: "workers", label: "Queue workers", kind: "system" };
  }
  if (
    /(^|\/)pipeline\.[cm]?[jt]sx?$/.test(file) ||
    file.includes("/pipelines/")
  ) {
    return { key: "pipelines", label: "Pipelines", kind: "pipeline" };
  }
  if (
    /(^|\/)(db|database|orders|reconcile)\.[cm]?[jt]sx?$/.test(file) ||
    file.includes("/prisma/")
  ) {
    return { key: "data", label: "Data access", kind: "system" };
  }

  return undefined;
}

function projectionEvidence(file: string): Evidence {
  return {
    file,
    extractor: "projection",
    certainty: "derived",
    detail: "Semantic system inferred from module path and naming conventions",
  };
}

function dedupeEvidence(evidence: Evidence[]): Evidence[] {
  const seen = new Set<string>();
  const result: Evidence[] = [];
  for (const item of evidence) {
    const key = `${item.file}|${item.detail ?? ""}|${item.certainty}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function normalizeTableKey(label: string): string {
  let value = label.trim().toLowerCase();
  if (value.endsWith("ies") && value.length > 3) {
    value = `${value.slice(0, -3)}y`;
  } else if (value.endsWith("s") && !value.endsWith("ss") && value.length > 3) {
    value = value.slice(0, -1);
  }
  return value;
}

function tableRank(node: ArchitectureNode): number {
  if (node.technology === "prisma" && !node.metadata?.discoveredFromUsage) {
    return 3;
  }
  if (node.technology === "sql") return 2;
  if (node.metadata?.discoveredFromUsage) return 1;
  return 0;
}

/**
 * Collapse raw file modules into product-level systems and wire
 * system-to-system flows so the default map reads as architecture,
 * not a symbol inventory.
 */
export function projectSemanticArchitecture(
  graph: ArchitectureGraph,
): ArchitectureGraph {
  const nodes = new Map(
    graph.nodes.map((node) => [node.id, { ...node, evidence: [...node.evidence] }]),
  );
  const edges = new Map(
    graph.edges.map((edge) => [edge.id, { ...edge, evidence: [...edge.evidence] }]),
  );

  const product = [...nodes.values()].find((node) => node.kind === "product");
  if (!product) return graph;

  const systems = new Map<string, ArchitectureNode>();
  const moduleToSystem = new Map<string, string>();

  for (const node of [...nodes.values()]) {
    if (!isFileModule(node)) continue;
    const role = inferSystemRole(modulePath(node));
    if (!role) continue;

    const systemId = stableId("system", role.key);
    let system = systems.get(role.key);
    if (!system) {
      system = {
        id: systemId,
        kind: role.kind,
        label: role.label,
        technology: "semantic",
        metadata: {
          projection: "semantic",
          systemKey: role.key,
        },
        evidence: [projectionEvidence(modulePath(node))],
      };
      systems.set(role.key, system);
      nodes.set(system.id, system);
    } else {
      system.evidence.push(projectionEvidence(modulePath(node)));
    }

    moduleToSystem.set(node.id, system.id);
    node.parentId = system.id;
    node.metadata = {
      ...node.metadata,
      projectedSystem: role.key,
    };
    nodes.set(node.id, node);
  }

  if (systems.size === 0) return graph;

  for (const system of systems.values()) {
    system.evidence = dedupeEvidence(system.evidence);
    nodes.set(system.id, system);
  }

  // Product contains systems (not raw projected modules).
  for (const [edgeId, edge] of [...edges.entries()]) {
    if (
      edge.kind === "contains" &&
      edge.source === product.id &&
      moduleToSystem.has(edge.target)
    ) {
      edges.delete(edgeId);
    }
  }

  for (const system of systems.values()) {
    const evidence = system.evidence[0]!;
    const productEdge = edgeFrom("contains", product.id, system.id, evidence);
    edges.set(productEdge.id, productEdge);

    for (const [moduleId, systemId] of moduleToSystem) {
      if (systemId !== system.id) continue;
      const moduleNode = nodes.get(moduleId);
      const moduleEvidence = moduleNode?.evidence[0] ?? evidence;
      const contains = edgeFrom(
        "contains",
        system.id,
        moduleId,
        moduleEvidence,
      );
      edges.set(contains.id, contains);
    }
  }

  const parentOf = new Map<string, string>();
  for (const node of nodes.values()) {
    if (node.parentId) parentOf.set(node.id, node.parentId);
  }
  for (const edge of edges.values()) {
    if (edge.kind === "contains") parentOf.set(edge.target, edge.source);
  }

  function owningModule(nodeId: string): string | undefined {
    let current: string | undefined = nodeId;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      if (moduleToSystem.has(current)) return current;
      seen.add(current);
      current = parentOf.get(current);
    }
    return undefined;
  }

  function owningSystem(nodeId: string): string | undefined {
    const moduleId = owningModule(nodeId);
    return moduleId ? moduleToSystem.get(moduleId) : undefined;
  }

  function attachToSystem(
    nodeId: string,
    systemId: string,
    evidence: Evidence,
  ): void {
    const node = nodes.get(nodeId);
    if (!node) return;
    if (node.metadata?.projection === "semantic") return;
    node.parentId = systemId;
    nodes.set(nodeId, node);

    for (const [edgeId, edge] of [...edges.entries()]) {
      if (
        edge.kind === "contains" &&
        edge.target === nodeId &&
        edge.source !== systemId
      ) {
        edges.delete(edgeId);
      }
    }

    const contains = edgeFrom("contains", systemId, nodeId, evidence);
    edges.set(contains.id, contains);
    parentOf.set(nodeId, systemId);
  }

  // Lift high-signal runtime nodes under their owning product systems.
  for (const node of [...nodes.values()]) {
    if (node.metadata?.projection === "semantic") continue;
    const systemId = owningSystem(node.id);
    if (!systemId) continue;
    const evidence = node.evidence[0] ?? projectionEvidence(".");

    if (
      node.kind === "route" ||
      node.kind === "cron" ||
      node.kind === "queue" ||
      node.kind === "component" ||
      node.kind === "page" ||
      node.kind === "hook" ||
      (node.kind === "pipeline" && node.technology !== "semantic") ||
      node.kind === "database" ||
      node.kind === "schema"
    ) {
      attachToSystem(node.id, systemId, evidence);
    }
  }

  // Nest pipeline steps under their pipeline parent when available.
  for (const edge of [...edges.values()]) {
    if (edge.kind !== "contains") continue;
    const parent = nodes.get(edge.source);
    const child = nodes.get(edge.target);
    if (parent?.kind === "pipeline" && child?.kind === "pipeline-step") {
      child.parentId = parent.id;
      nodes.set(child.id, child);
    }
  }

  // Attach databases discovered only via Prisma/SQL files to Data access.
  const dataSystem = systems.get("data");
  if (dataSystem) {
    for (const node of [...nodes.values()]) {
      if (node.kind === "database" || node.kind === "schema") {
        attachToSystem(
          node.id,
          dataSystem.id,
          node.evidence[0] ?? projectionEvidence("."),
        );
      }
    }
  }

  // Collapse duplicate table nodes (Order / order / orders).
  const tablesByKey = new Map<string, ArchitectureNode[]>();
  for (const node of nodes.values()) {
    if (node.kind !== "table") continue;
    const key = normalizeTableKey(node.label);
    const bucket = tablesByKey.get(key) ?? [];
    bucket.push(node);
    tablesByKey.set(key, bucket);
  }

  const redirect = new Map<string, string>();
  for (const [key, bucket] of tablesByKey) {
    if (bucket.length < 2) continue;
    const ranked = [...bucket].sort((a, b) => {
      const rankDiff = tableRank(b) - tableRank(a);
      if (rankDiff !== 0) return rankDiff;
      return a.id.localeCompare(b.id);
    });
    const canonical = ranked[0]!;
    canonical.metadata = {
      ...canonical.metadata,
      aliases: ranked.slice(1).map((node) => node.label),
      normalizedTable: key,
    };
    for (const duplicate of ranked.slice(1)) {
      for (const child of nodes.values()) {
        if (child.parentId === duplicate.id) {
          child.parentId = canonical.id;
          nodes.set(child.id, child);
        }
      }
      redirect.set(duplicate.id, canonical.id);
      canonical.evidence.push(...duplicate.evidence);
      nodes.delete(duplicate.id);
    }
    canonical.evidence = dedupeEvidence(canonical.evidence);
    if (dataSystem) {
      attachToSystem(
        canonical.id,
        dataSystem.id,
        canonical.evidence[0] ?? projectionEvidence("."),
      );
    }
    nodes.set(canonical.id, canonical);
  }

  for (const [edgeId, edge] of [...edges.entries()]) {
    const source = redirect.get(edge.source) ?? edge.source;
    const target = redirect.get(edge.target) ?? edge.target;
    if (!nodes.has(source) || !nodes.has(target)) {
      edges.delete(edgeId);
      continue;
    }
    if (source === edge.source && target === edge.target) continue;
    edges.delete(edgeId);
    if (source === target) continue;
    const retargeted = edgeFrom(
      edge.kind,
      source,
      target,
      edge.evidence[0]!,
      edge.label,
    );
    edges.set(retargeted.id, retargeted);
  }

  // Lift cross-system imports/calls into system dependencies.
  for (const edge of graph.edges) {
    if (edge.kind !== "imports" && edge.kind !== "calls") continue;
    const sourceSystem = owningSystem(edge.source);
    const targetSystem = owningSystem(edge.target);
    if (!sourceSystem || !targetSystem || sourceSystem === targetSystem) {
      continue;
    }
    const dependency = edgeFrom(
      "depends-on",
      sourceSystem,
      targetSystem,
      {
        ...edge.evidence[0]!,
        extractor: "projection",
        certainty: "derived",
        detail: `Lifted from ${edge.kind}`,
      },
    );
    if (!edges.has(dependency.id)) edges.set(dependency.id, dependency);
  }

  const systemsByKey = new Map(
    [...systems.entries()].map(([key, node]) => [key, node.id]),
  );
  for (const [fromKey, toKey] of preferredFlows) {
    const from = systemsByKey.get(fromKey);
    const to = systemsByKey.get(toKey);
    if (!from || !to) continue;
    const flow = edgeFrom(
      "flows-to",
      from,
      to,
      {
        file: ".",
        extractor: "projection",
        certainty: "inferred",
        detail: `Preferred product flow ${fromKey} → ${toKey}`,
      },
      `${fromKey} → ${toKey}`,
    );
    if (!edges.has(flow.id)) edges.set(flow.id, flow);
  }

  const projected: ArchitectureGraph = {
    ...graph,
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics: [
      ...graph.diagnostics,
      {
        severity: "info",
        code: "semantic-projection",
        message: `Projected ${systems.size} product system(s) from module paths`,
      },
    ],
  };

  return architectureGraphSchema.parse(projected);
}
