import { stableId } from "../graph.js";
import type {
  ArchitectureNode,
  Evidence,
  SemanticFacet,
} from "../schema.js";

export type EndpointFacet = Extract<SemanticFacet, { kind: "endpoint" }>;

export function endpointFacet(node: ArchitectureNode): EndpointFacet | undefined {
  return node.semantics?.find(
    (facet): facet is EndpointFacet => facet.kind === "endpoint",
  );
}

export function createHttpApiSystem(evidence: Evidence): ArchitectureNode {
  return {
    id: stableId("system", "api"),
    kind: "api",
    label: "HTTP API",
    technology: "semantic",
    metadata: { projection: "semantic", systemKey: "api" },
    evidence: [evidence],
  };
}

export function projectHttpArchitecture(args: {
  nodes: Map<string, ArchitectureNode>;
  apiSystem: ArchitectureNode;
  attach(nodeId: string, systemId: string, evidence: Evidence): void;
}): void {
  for (const node of args.nodes.values()) {
    const endpoint = endpointFacet(node);
    if (!endpoint) continue;
    node.label = `${endpoint.method} ${endpoint.path}`;
    args.nodes.set(node.id, node);
    args.attach(node.id, args.apiSystem.id, node.evidence[0]!);
  }
}
