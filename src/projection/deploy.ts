import type { ArchitectureNode, Evidence, SemanticFacet } from "../schema.js";
import { projectionEvidence } from "./common.js";
import { humanizeIdentifierLabel } from "./labels.js";

type DeployFacet = Extract<SemanticFacet, { kind: "deploy-unit" }>;

const kubernetesNameSegments = [
  "opentelemetry",
  "recommendation",
  "product",
  "catalog",
  "shopping",
  "assistant",
  "generator",
  "collector",
  "checkout",
  "currency",
  "payment",
  "shipping",
  "frontend",
  "backend",
  "service",
  "redis",
  "email",
  "cart",
  "load",
  "web",
  "api",
  "ad",
].sort((a, b) => b.length - a.length);

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

export function deployFacet(
  node: ArchitectureNode,
): DeployFacet | undefined {
  return node.semantics?.find(
    (facet): facet is DeployFacet => facet.kind === "deploy-unit",
  );
}

export function humanizeTerraformLabel(
  kind: "resource" | "module",
  type: string,
  name?: string,
): string {
  if (kind === "module") return humanizeIdentifierLabel(type);
  const withoutProvider = type.replace(
    /^(aws|google|azurerm|azuread|digitalocean|helm|kubernetes|random|null|local|tls|archive|time|external|cloudflare|vercel)_/i,
    "",
  );
  const typeLabel = humanizeIdentifierLabel(withoutProvider);
  const rawName = name?.trim();
  if (!rawName || /^this$/i.test(rawName)) return typeLabel;
  return `${humanizeIdentifierLabel(rawName)} · ${typeLabel}`;
}

export function splitGluedKubernetesName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  if (/[-_]/.test(trimmed) || /[a-z][A-Z]/.test(trimmed)) {
    return trimmed.replace(/([a-z0-9])service$/i, "$1Service");
  }
  const lower = trimmed.toLowerCase();
  if (!/^[a-z][a-z0-9]*$/.test(lower)) {
    return trimmed.replace(/([a-z0-9])service$/i, "$1Service");
  }
  const parts: string[] = [];
  let index = 0;
  while (index < lower.length) {
    const matched = kubernetesNameSegments.find((word) =>
      lower.startsWith(word, index),
    );
    if (!matched) {
      return trimmed.replace(/([a-z0-9])service$/i, "$1Service");
    }
    parts.push(matched);
    index += matched.length;
  }
  if (parts.length <= 1) {
    return trimmed.replace(/([a-z0-9])service$/i, "$1Service");
  }
  return parts
    .map((part, partIndex) =>
      partIndex === 0
        ? part
        : `${part.charAt(0).toUpperCase()}${part.slice(1)}`,
    )
    .join("");
}

export function humanizeKubernetesLabel(
  kind: string,
  name: string,
  hosts?: string[],
): string {
  const base = humanizeIdentifierLabel(splitGluedKubernetesName(name));
  if (kind === "Ingress") {
    const host = hosts?.find((item) => item.trim());
    if (host) return `${base} · ${host.trim()}`;
  }
  return `${base} · ${kind}`;
}

export function humanizeDeployNodeLabel(
  node: ArchitectureNode,
): string | undefined {
  const facet = deployFacet(node);
  if (!facet) return undefined;

  if (facet.provider === "docker-compose" && facet.name) {
    const base = humanizeIdentifierLabel(facet.name);
    const hostPorts = Array.isArray(node.metadata?.hostPorts)
      ? node.metadata.hostPorts.filter(
          (port): port is string => typeof port === "string" && Boolean(port),
        )
      : [];
    const storyPort = hostPorts.find((port) => !/^9\d{3}$/.test(port));
    return storyPort ? `${base} · ${storyPort}` : base;
  }
  if (facet.provider === "terraform" && facet.nativeKind) {
    return humanizeTerraformLabel(
      facet.nativeKind === "module" ? "module" : "resource",
      facet.nativeKind === "module" ? (facet.name ?? "module") : facet.nativeKind,
      facet.nativeKind === "module" ? undefined : facet.name,
    );
  }
  if (
    (facet.provider === "kubernetes" || facet.provider === "helm") &&
    facet.nativeKind &&
    facet.name
  ) {
    const hosts = Array.isArray(node.metadata?.hosts)
      ? node.metadata.hosts.filter(
          (host): host is string => typeof host === "string" && Boolean(host),
        )
      : undefined;
    return humanizeKubernetesLabel(facet.nativeKind, facet.name, hosts);
  }
  if (facet.deployKind === "package" && facet.name) {
    return `${humanizeIdentifierLabel(facet.name)} · Chart`;
  }
  if (facet.deployKind === "overlay" && facet.name) {
    return `${humanizeIdentifierLabel(facet.name)} · ${facet.nativeKind ?? "Overlay"}`;
  }
  return undefined;
}

interface DeployProjectionArgs {
  nodes: Map<string, ArchitectureNode>;
  deploySystem: ArchitectureNode;
  attach(nodeId: string, systemId: string, evidence: Evidence): void;
}

export function projectDeployArchitecture(args: DeployProjectionArgs): void {
  for (const node of [...args.nodes.values()]) {
    if (!deployFacet(node) || node.metadata?.projection === "semantic") continue;
    args.attach(
      node.id,
      args.deploySystem.id,
      node.evidence[0] ?? projectionEvidence("."),
    );
  }
  nestKubernetesUnderKustomizeHubs(args.nodes, args.attach);
}

function nestKubernetesUnderKustomizeHubs(
  nodes: Map<string, ArchitectureNode>,
  attach: DeployProjectionArgs["attach"],
): void {
  const hubs = [...nodes.values()]
    .filter((node) => {
      const facet = deployFacet(node);
      if (!facet || facet.deployKind !== "overlay") return false;
      if (
        node.metadata?.kustomizeChrome === true ||
        node.metadata?.exampleChrome === true
      ) {
        return false;
      }
      const root = normalizePath(String(node.metadata?.overlayRoot ?? ""));
      if (!root) return false;
      return !(
        /(^|\/)(k8s|kubernetes)(-?manifests?)?(\/|$)/i.test(root) ||
        /(^|\/)manifests?(\/|$)/i.test(root)
      );
    })
    .map((node) => ({
      id: node.id,
      root: normalizePath(String(node.metadata!.overlayRoot)),
    }))
    .sort((a, b) => b.root.length - a.root.length);
  if (!hubs.length) return;

  for (const node of [...nodes.values()]) {
    const facet = deployFacet(node);
    if (!facet || facet.provider !== "kubernetes") continue;
    const file = normalizePath(node.evidence[0]?.file ?? "");
    const hub = hubs.find(
      (entry) => file === entry.root || file.startsWith(`${entry.root}/`),
    );
    if (!hub) continue;
    attach(node.id, hub.id, node.evidence[0] ?? projectionEvidence("."));
    const nested = nodes.get(node.id);
    if (!nested) continue;
    nested.metadata = { ...nested.metadata, collapsedInOverview: true };
    nodes.set(nested.id, nested);
  }
}
