import { createHash } from "node:crypto";
import path from "node:path";
import {
  architectureGraphSchema,
  type ArchitectureEdge,
  type ArchitectureGraph,
  type ArchitectureNode,
  type Diagnostic,
  type EdgeKind,
  type Evidence,
} from "./schema.js";

export interface ExtractorContribution {
  extractor: { id: string; version: string };
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  diagnostics?: Diagnostic[];
}

export function stableId(...parts: string[]): string {
  const readable = parts
    .map((part) => part.trim().replaceAll("\\", "/"))
    .filter(Boolean)
    .join(":");
  const hash = createHash("sha1").update(readable).digest("hex").slice(0, 10);
  return `${readable.replace(/[^a-zA-Z0-9_./:#-]+/g, "-")}:${hash}`;
}

export function relativeFile(root: string, file: string): string {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

export function edgeFrom(
  kind: EdgeKind,
  source: string,
  target: string,
  evidence: Evidence,
  label?: string,
): ArchitectureEdge {
  const edge: ArchitectureEdge = {
    id: stableId("edge", kind, source, target, label ?? ""),
    kind,
    source,
    target,
    metadata: {},
    evidence: [evidence],
  };
  if (label !== undefined) edge.label = label;
  return edge;
}

export class GraphBuilder {
  readonly #nodes = new Map<string, ArchitectureNode>();
  readonly #edges = new Map<string, ArchitectureEdge>();
  readonly #extractors = new Map<string, { id: string; version: string }>();
  readonly #diagnostics: Diagnostic[] = [];

  add(contribution: ExtractorContribution): void {
    this.#extractors.set(
      contribution.extractor.id,
      contribution.extractor,
    );

    for (const node of contribution.nodes) {
      const current = this.#nodes.get(node.id);
      if (!current) {
        this.#nodes.set(node.id, node);
        continue;
      }
      current.evidence.push(...node.evidence);
      current.metadata = { ...current.metadata, ...node.metadata };
    }

    for (const edge of contribution.edges) {
      const current = this.#edges.get(edge.id);
      if (!current) {
        this.#edges.set(edge.id, edge);
        continue;
      }
      current.evidence.push(...edge.evidence);
    }

    this.#diagnostics.push(...(contribution.diagnostics ?? []));
  }

  build(project: ArchitectureGraph["project"]): ArchitectureGraph {
    const graph: ArchitectureGraph = {
      schemaVersion: "0.1",
      project,
      generatedAt: new Date().toISOString(),
      extractors: [...this.#extractors.values()].sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
      nodes: [...this.#nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
      edges: [...this.#edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
      diagnostics: this.#diagnostics,
    };

    return architectureGraphSchema.parse(graph);
  }
}
