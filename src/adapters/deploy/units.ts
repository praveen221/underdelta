import type { SemanticAdapter } from "../../adapter.js";
import type {
  ArchitectureNode,
  SemanticFacet,
} from "../../schema.js";

type DeployFacet = Extract<SemanticFacet, { kind: "deploy-unit" }>;

const workloadKinds = new Set([
  "Deployment",
  "StatefulSet",
  "DaemonSet",
  "Job",
  "Pod",
]);

const serviceKinds = new Set(["Service", "Ingress"]);

function stringValue(
  node: ArchitectureNode,
  key: string,
): string | undefined {
  const value = node.metadata?.[key];
  return typeof value === "string" && value ? value : undefined;
}

function stringList(
  node: ArchitectureNode,
  key: string,
): string[] | undefined {
  const values = node.metadata?.[key];
  if (!Array.isArray(values)) return undefined;
  const strings = values.filter(
    (value): value is string => typeof value === "string" && Boolean(value),
  );
  return strings.length ? strings : undefined;
}

function kubernetesDeployKind(nativeKind: string): DeployFacet["deployKind"] {
  if (nativeKind === "CronJob") return "scheduled-workload";
  if (workloadKinds.has(nativeKind)) return "workload";
  if (serviceKinds.has(nativeKind)) return "service";
  return "infrastructure";
}

function facetFor(node: ArchitectureNode): DeployFacet | undefined {
  if (node.kind !== "service") return undefined;

  if (node.metadata?.dockerService === true) {
    return {
      kind: "deploy-unit",
      deployKind: "container",
      provider: "docker-compose",
      nativeKind: "Compose service",
      ...(stringValue(node, "serviceName")
        ? { name: stringValue(node, "serviceName")! }
        : {}),
      ...(stringValue(node, "image")
        ? { image: stringValue(node, "image")! }
        : {}),
      ...(stringList(node, "ports")
        ? { ports: stringList(node, "ports")! }
        : {}),
    };
  }

  if (node.metadata?.dockerfileService === true) {
    return {
      kind: "deploy-unit",
      deployKind: "container",
      provider: "dockerfile",
      nativeKind: "Docker image",
      ...(stringList(node, "expose")
        ? { ports: stringList(node, "expose")! }
        : {}),
    };
  }

  if (node.metadata?.terraformResource === true) {
    return {
      kind: "deploy-unit",
      deployKind: "infrastructure",
      provider: "terraform",
      ...(stringValue(node, "resourceType")
        ? { nativeKind: stringValue(node, "resourceType")! }
        : {}),
      ...(stringValue(node, "resourceName")
        ? { name: stringValue(node, "resourceName")! }
        : {}),
      ...(stringValue(node, "address")
        ? { address: stringValue(node, "address")! }
        : {}),
    };
  }

  if (node.metadata?.terraformModuleBlock === true) {
    return {
      kind: "deploy-unit",
      deployKind: "infrastructure",
      provider: "terraform",
      nativeKind: "module",
      ...(stringValue(node, "moduleName")
        ? { name: stringValue(node, "moduleName")! }
        : {}),
      ...(stringValue(node, "address")
        ? { address: stringValue(node, "address")! }
        : {}),
    };
  }

  if (
    node.metadata?.kubernetesResource === true ||
    node.metadata?.helmResource === true
  ) {
    const nativeKind = stringValue(node, "k8sKind");
    if (!nativeKind) return undefined;
    return {
      kind: "deploy-unit",
      deployKind: kubernetesDeployKind(nativeKind),
      provider: node.metadata?.helmResource === true ? "helm" : "kubernetes",
      nativeKind,
      ...(stringValue(node, "resourceName")
        ? { name: stringValue(node, "resourceName")! }
        : {}),
      ...(stringValue(node, "address")
        ? { address: stringValue(node, "address")! }
        : {}),
      ...(stringValue(node, "namespace")
        ? { namespace: stringValue(node, "namespace")! }
        : {}),
    };
  }

  if (node.metadata?.helmChart === true) {
    return {
      kind: "deploy-unit",
      deployKind: "package",
      provider: "helm",
      nativeKind: "Chart",
      ...(stringValue(node, "chartName")
        ? { name: stringValue(node, "chartName")! }
        : {}),
      ...(stringValue(node, "address")
        ? { address: stringValue(node, "address")! }
        : {}),
    };
  }

  if (node.metadata?.kustomization === true) {
    const role = stringValue(node, "kustomizeRole");
    return {
      kind: "deploy-unit",
      deployKind: "overlay",
      provider: "kustomize",
      nativeKind: role === "base" ? "Base" : "Overlay",
      ...(stringValue(node, "overlayName")
        ? { name: stringValue(node, "overlayName")! }
        : {}),
      ...(stringValue(node, "address")
        ? { address: stringValue(node, "address")! }
        : {}),
      ...(stringValue(node, "namespace")
        ? { namespace: stringValue(node, "namespace")! }
        : {}),
    };
  }

  return undefined;
}

export function deployFacet(node: ArchitectureNode): DeployFacet | undefined {
  return node.semantics?.find(
    (facet): facet is DeployFacet => facet.kind === "deploy-unit",
  );
}

export const deployUnitAdapter: SemanticAdapter = {
  id: "deploy-units",
  version: "0.2.0",
  capability: "deployment",
  extensions: new Set(),

  async extract(context) {
    const nodes: ArchitectureNode[] = [];
    for (const node of context.nodes) {
      if (deployFacet(node)) continue;
      const facet = facetFor(node);
      const source = node.evidence[0];
      if (!facet || !source) continue;
      nodes.push({
        ...node,
        semantics: [facet],
        metadata: {},
        evidence: [{
          ...source,
          extractor: this.id,
          certainty: "derived",
          detail: `Normalized ${facet.deployKind} deploy unit from ${facet.provider}`,
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
