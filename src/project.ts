import { edgeFrom, stableId } from "./graph.js";
import {
  architectureGraphSchema,
  type ArchitectureGraph,
  type ArchitectureNode,
  type EdgeKind,
  type Evidence,
  type NodeKind,
} from "./schema.js";

export interface PackageManifestHint {
  name?: string;
  bin?: string | Record<string, string>;
  exports?: unknown;
  main?: string;
}

export interface ProjectOptions {
  packageManifest?: PackageManifestHint;
}

interface SystemRole {
  key: string;
  label: string;
  kind: NodeKind;
}

const preferredFlows: Array<[string, string]> = [
  ["cli", "compile"],
  ["compile", "extractors"],
  ["extractors", "graph"],
  ["compile", "artifact"],
  ["graph", "artifact"],
  ["artifact", "viewer"],
  ["artifact", "browser"],
  ["viewer", "browser"],
  ["schema", "graph"],
  ["schema", "extractors"],
  ["ui", "api"],
  ["api", "pipelines"],
  ["api", "workers"],
  ["api", "data"],
  ["jobs", "data"],
  ["pipelines", "data"],
  ["workers", "data"],
  ["viewer", "api"],
];

/** How product systems collaborate beyond the left-to-right flow band. */
const collaborationEdges: Array<{
  from: string;
  to: string;
  kind: EdgeKind;
  label: string;
  detail: string;
}> = [
  {
    from: "cli",
    to: "compile",
    kind: "triggers",
    label: "scan",
    detail: "CLI scan command triggers the compile pipeline",
  },
  {
    from: "cli",
    to: "artifact",
    kind: "exposes",
    label: "architecture.json",
    detail: "CLI scan writes the architecture IR artifact",
  },
  {
    from: "cli",
    to: "browser",
    kind: "exposes",
    label: "index.html",
    detail: "CLI scan writes the self-contained browser artifact",
  },
  {
    from: "compile",
    to: "extractors",
    kind: "uses",
    label: "extract",
    detail: "Compile pipeline uses language extractors",
  },
  {
    from: "compile",
    to: "graph",
    kind: "uses",
    label: "assemble",
    detail: "Compile pipeline uses graph assembly",
  },
  {
    from: "compile",
    to: "schema",
    kind: "uses",
    label: "validate",
    detail: "Compile pipeline validates against the schema contract",
  },
  {
    from: "extractors",
    to: "schema",
    kind: "uses",
    label: "kinds",
    detail: "Extractors emit schema-shaped architecture nodes",
  },
  {
    from: "graph",
    to: "schema",
    kind: "uses",
    label: "contract",
    detail: "Graph assembly conforms to the schema contract",
  },
  {
    from: "schema",
    to: "extractors",
    kind: "configures",
    label: "shape",
    detail: "Schema contract configures extractor output shape",
  },
  {
    from: "schema",
    to: "graph",
    kind: "configures",
    label: "shape",
    detail: "Schema contract configures graph assembly shape",
  },
  {
    from: "viewer",
    to: "graph",
    kind: "renders",
    label: "graph",
    detail: "Viewer renders the assembled architecture graph",
  },
  {
    from: "viewer",
    to: "artifact",
    kind: "renders",
    label: "IR",
    detail: "Viewer renders architecture.json into the browser",
  },
  {
    from: "viewer",
    to: "browser",
    kind: "exposes",
    label: "index.html",
    detail: "Viewer emits the index.html browser artifact",
  },
];

function assignFlowOrder(
  systems: Map<string, ArchitectureNode>,
  flowPairs: Array<[string, string]>,
): void {
  const keys = [...systems.keys()];
  const indegree = new Map(keys.map((key) => [key, 0]));
  const adjacency = new Map(keys.map((key) => [key, [] as string[]]));

  for (const [from, to] of flowPairs) {
    if (!systems.has(from) || !systems.has(to)) continue;
    adjacency.get(from)!.push(to);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
  }

  const queue = keys
    .filter((key) => (indegree.get(key) ?? 0) === 0)
    .sort((a, b) => a.localeCompare(b));
  const ordered: string[] = [];

  while (queue.length) {
    const key = queue.shift()!;
    ordered.push(key);
    for (const next of adjacency.get(key) ?? []) {
      const nextDegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) {
        queue.push(next);
        queue.sort((a, b) => a.localeCompare(b));
      }
    }
  }

  for (const key of keys) {
    if (!ordered.includes(key)) ordered.push(key);
  }

  ordered.forEach((key, index) => {
    const node = systems.get(key);
    if (!node) return;
    node.metadata = {
      ...node.metadata,
      flowOrder: index,
    };
  });
}

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

function projectionEvidence(file: string, detail?: string): Evidence {
  const evidence: Evidence = {
    file,
    extractor: "projection",
    certainty: "derived",
  };
  if (detail !== undefined) {
    evidence.detail = detail;
  } else {
    evidence.detail =
      "Semantic system inferred from module path and naming conventions";
  }
  return evidence;
}

function normalizeBinEntries(
  bin: PackageManifestHint["bin"],
): Array<{ name: string; path: string }> {
  if (!bin) return [];
  if (typeof bin === "string") {
    return [{ name: "cli", path: normalizePath(bin) }];
  }
  return Object.entries(bin).map(([name, entryPath]) => ({
    name,
    path: normalizePath(entryPath),
  }));
}

function guessSourceFromDist(entryPath: string): string {
  return normalizePath(entryPath)
    .replace(/^\.\//, "")
    .replace(/^dist\//, "src/")
    .replace(/\.js$/i, ".ts");
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
  options: ProjectOptions = {},
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

  // Nest extracted pipelines under the semantic Pipelines system.
  const pipelinesSystem = systems.get("pipelines");
  if (pipelinesSystem) {
    for (const node of [...nodes.values()]) {
      if (
        node.kind === "pipeline" &&
        node.metadata?.projection !== "semantic" &&
        node.id !== pipelinesSystem.id
      ) {
        attachToSystem(
          node.id,
          pipelinesSystem.id,
          node.evidence[0] ?? projectionEvidence("."),
        );
      }
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

  // Lift publishes/consumes onto owning systems and keep messaging hubs visible.
  const queueRoles = new Map<
    string,
    { publishers: Set<string>; consumers: Set<string> }
  >();

  function recordQueueRole(
    queueId: string,
    role: "publishers" | "consumers",
    systemId: string,
  ): void {
    const entry = queueRoles.get(queueId) ?? {
      publishers: new Set<string>(),
      consumers: new Set<string>(),
    };
    entry[role].add(systemId);
    queueRoles.set(queueId, entry);
  }

  for (const edge of [...edges.values()]) {
    if (edge.kind !== "publishes" && edge.kind !== "consumes") continue;
    const queue = nodes.get(edge.target);
    if (!queue || queue.kind !== "queue") continue;
    const systemId = owningSystem(edge.source);
    if (!systemId) continue;
    const role = edge.kind === "publishes" ? "publishers" : "consumers";
    recordQueueRole(queue.id, role, systemId);
    const lifted = edgeFrom(
      edge.kind,
      systemId,
      queue.id,
      {
        ...edge.evidence[0]!,
        extractor: "projection",
        certainty: "derived",
        detail: `Lifted ${edge.kind} onto product system`,
      },
      edge.label,
    );
    if (!edges.has(lifted.id)) edges.set(lifted.id, lifted);
  }

  // If API (or another system) calls a publisher, treat the caller as a publisher too.
  for (const edge of graph.edges) {
    if (edge.kind !== "calls" && edge.kind !== "imports") continue;
    const callerSystem = owningSystem(edge.source);
    if (!callerSystem) continue;
    for (const pub of edges.values()) {
      if (pub.kind !== "publishes" || pub.source !== edge.target) continue;
      const queue = nodes.get(pub.target);
      if (!queue || queue.kind !== "queue") continue;
      recordQueueRole(queue.id, "publishers", callerSystem);
      const lifted = edgeFrom(
        "publishes",
        callerSystem,
        queue.id,
        {
          ...pub.evidence[0]!,
          extractor: "projection",
          certainty: "inferred",
          detail: `Caller system publishes via ${edge.kind}`,
        },
      );
      if (!edges.has(lifted.id)) edges.set(lifted.id, lifted);
    }
  }

  for (const [queueId, roles] of queueRoles) {
    const queue = nodes.get(queueId);
    if (!queue) continue;
    queue.metadata = {
      ...queue.metadata,
      publishers: [...roles.publishers]
        .map((id) => nodes.get(id)?.label)
        .filter(Boolean),
      consumers: [...roles.consumers]
        .map((id) => nodes.get(id)?.label)
        .filter(Boolean),
      messagingHub: roles.publishers.size > 0 && roles.consumers.size > 0,
    };
    // Shared queues sit under workers when present, else stay with their owner.
    const workersSystem = systems.get("workers");
    if (workersSystem && roles.consumers.has(workersSystem.id)) {
      attachToSystem(
        queueId,
        workersSystem.id,
        queue.evidence[0] ?? projectionEvidence("."),
      );
    }
    nodes.set(queueId, queue);
  }

  // Hide leaves that only restate their parent semantic system on the overview.
  // Messaging hubs stay visible so publish/consume is readable without Details.
  const collapsibleKinds = new Set([
    "route",
    "component",
    "page",
    "hook",
    "cron",
    "queue",
    "database",
    "schema",
    "pipeline",
  ]);
  for (const node of nodes.values()) {
    if (node.metadata?.projection === "semantic") continue;
    if (!collapsibleKinds.has(node.kind)) continue;
    if (node.kind === "queue" && node.metadata?.messagingHub) continue;
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent?.metadata?.projection === "semantic") {
      node.metadata = {
        ...node.metadata,
        collapsedInOverview: true,
      };
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

  // Synthesize scan output artifacts on tooling self-maps:
  // architecture.json (IR) beside index.html (browser).
  if (
    (systems.has("compile") || systems.has("graph")) &&
    (systems.has("viewer") || systems.has("cli"))
  ) {
    const artifactId = stableId("system", "artifact");
    const artifact: ArchitectureNode = {
      id: artifactId,
      kind: "config",
      label: "architecture.json",
      technology: "underdelta",
      metadata: {
        projection: "semantic",
        systemKey: "artifact",
        role: "artifact",
        artifactKind: "architecture-ir",
      },
      evidence: [
        {
          file: ".underdelta/architecture.json",
          extractor: "projection",
          certainty: "derived",
          detail: "Compiled portable architecture IR written by underdelta scan",
        },
      ],
    };
    systems.set("artifact", artifact);
    nodes.set(artifact.id, artifact);
    const productEdge = edgeFrom(
      "contains",
      product.id,
      artifact.id,
      artifact.evidence[0]!,
    );
    edges.set(productEdge.id, productEdge);

    const browserId = stableId("system", "browser");
    const browser: ArchitectureNode = {
      id: browserId,
      kind: "config",
      label: "index.html",
      technology: "underdelta",
      metadata: {
        projection: "semantic",
        systemKey: "browser",
        role: "artifact",
        artifactKind: "browser",
      },
      evidence: [
        {
          file: ".underdelta/index.html",
          extractor: "projection",
          certainty: "derived",
          detail:
            "Self-contained architecture browser written by underdelta scan/render",
        },
      ],
    };
    systems.set("browser", browser);
    nodes.set(browser.id, browser);
    const browserProductEdge = edgeFrom(
      "contains",
      product.id,
      browser.id,
      browser.evidence[0]!,
    );
    edges.set(browserProductEdge.id, browserProductEdge);
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

  // Collaboration edges describe how systems work together (uses/renders/…),
  // complementary to the left-to-right flows-to story band.
  for (const collab of collaborationEdges) {
    const from = systemsByKey.get(collab.from);
    const to = systemsByKey.get(collab.to);
    if (!from || !to) continue;
    const edge = edgeFrom(
      collab.kind,
      from,
      to,
      {
        file: ".",
        extractor: "projection",
        certainty: "inferred",
        detail: collab.detail,
      },
      collab.label,
    );
    if (!edges.has(edge.id)) edges.set(edge.id, edge);
  }

  // Project package.json bin / exports into the product map.
  const manifest = options.packageManifest;
  if (manifest) {
    const binEntries = normalizeBinEntries(manifest.bin);
    if (binEntries.length > 0) {
      let cli = systems.get("cli");
      if (!cli) {
        cli = {
          id: stableId("system", "cli"),
          kind: "system",
          label: "CLI",
          technology: "semantic",
          metadata: {
            projection: "semantic",
            systemKey: "cli",
          },
          evidence: [],
        };
        systems.set("cli", cli);
        nodes.set(cli.id, cli);
        const productEdge = edgeFrom(
          "contains",
          product.id,
          cli.id,
          projectionEvidence(
            "package.json",
            "CLI inferred from package.json bin",
          ),
        );
        edges.set(productEdge.id, productEdge);
      }

      cli.metadata = {
        ...cli.metadata,
        binCommands: binEntries.map((entry) => entry.name),
        binEntries: Object.fromEntries(
          binEntries.map((entry) => [entry.name, entry.path]),
        ),
      };

      for (const entry of binEntries) {
        cli.evidence.push(
          projectionEvidence(
            "package.json",
            `bin.${entry.name} → ${entry.path}`,
          ),
        );
        const sourceGuess = guessSourceFromDist(entry.path);
        for (const node of nodes.values()) {
          if (!isFileModule(node)) continue;
          const file = modulePath(node);
          if (file !== sourceGuess && file !== normalizePath(entry.path)) {
            continue;
          }
          moduleToSystem.set(node.id, cli.id);
          node.parentId = cli.id;
          node.metadata = {
            ...node.metadata,
            projectedSystem: "cli",
            packageBin: entry.name,
          };
          nodes.set(node.id, node);
          const contains = edgeFrom(
            "contains",
            cli.id,
            node.id,
            projectionEvidence(
              "package.json",
              `package bin ${entry.name} maps to ${file}`,
            ),
          );
          edges.set(contains.id, contains);
        }
        const exposes = edgeFrom(
          "exposes",
          product.id,
          cli.id,
          projectionEvidence(
            "package.json",
            `package exposes CLI command ${entry.name}`,
          ),
          entry.name,
        );
        edges.set(exposes.id, exposes);
      }
      nodes.set(cli.id, cli);
    }

    if (manifest.exports !== undefined || manifest.main !== undefined) {
      product.metadata = {
        ...product.metadata,
        packageExports: manifest.exports ?? null,
        packageMain: manifest.main ?? null,
      };
      product.evidence = dedupeEvidence([
        ...product.evidence,
        projectionEvidence(
          "package.json",
          "Package entrypoints declared in package.json",
        ),
      ]);
      nodes.set(product.id, product);
    }
  }

  assignFlowOrder(systems, preferredFlows);

  // Surface key source files on every semantic system for the inspector.
  for (const system of systems.values()) {
    const keyFiles: string[] = [];
    for (const item of system.evidence) {
      if (item.file && item.file !== ".") keyFiles.push(normalizePath(item.file));
    }
    for (const [moduleId, systemId] of moduleToSystem) {
      if (systemId !== system.id) continue;
      const moduleNode = nodes.get(moduleId);
      if (moduleNode) keyFiles.push(modulePath(moduleNode));
    }
    system.metadata = {
      ...system.metadata,
      keyFiles: [...new Set(keyFiles)].slice(0, 12),
    };
    system.evidence = dedupeEvidence(system.evidence);
    nodes.set(system.id, system);
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
