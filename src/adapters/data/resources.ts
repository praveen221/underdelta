import type { SemanticAdapter } from "../../adapter.js";
import type { ArchitectureNode, SemanticFacet } from "../../schema.js";

function resourceKind(
  node: ArchitectureNode,
): Extract<SemanticFacet, { kind: "resource" }>["resourceKind"] | undefined {
  if (node.kind === "database") return "database";
  if (node.kind === "table") return "table";
  if (node.kind === "collection") return "collection";
  return undefined;
}

export const dataResourceAdapter: SemanticAdapter = {
  id: "data-resources",
  version: "0.2.0",
  capability: "data-access",
  extensions: new Set(),

  async extract(context) {
    const nodes: ArchitectureNode[] = [];
    for (const node of context.nodes) {
      const kind = resourceKind(node);
      if (!kind || node.semantics?.some((facet) => facet.kind === "resource")) {
        continue;
      }
      const source = node.evidence[0];
      if (!source) continue;
      nodes.push({
        ...node,
        semantics: [{
          kind: "resource",
          resourceKind: kind,
          ...(node.technology ? { provider: node.technology } : {}),
        }],
        metadata: {},
        evidence: [{
          ...source,
          extractor: this.id,
          certainty: "derived",
          detail: `Normalized ${kind} resource from ${node.kind}:${node.label}`,
        }],
      });
    }

    return {
      adapter: {
        id: this.id,
        version: this.version,
        capability: this.capability,
      },
      nodes,
      edges: [],
      diagnostics: [],
    };
  },
};
