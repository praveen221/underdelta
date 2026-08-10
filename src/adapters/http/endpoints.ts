import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SemanticAdapter } from "../../adapter.js";
import { edgeFrom } from "../../graph.js";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  SemanticFacet,
} from "../../schema.js";

type EndpointFacet = Extract<SemanticFacet, { kind: "endpoint" }>;
const unsupportedNodePackages = new Set([
  "fastify",
  "@nestjs/common",
  "koa",
  "@koa/router",
  "hono",
  "@hapi/hapi",
  "restify",
  "elysia",
]);

async function nodePackages(files: readonly string[]): Promise<Set<string>> {
  const packages = new Set<string>();
  for (const manifest of files.filter((file) => path.basename(file) === "package.json")) {
    try {
      const parsed = JSON.parse(await readFile(manifest, "utf8")) as {
        dependencies?: Record<string, unknown>;
        devDependencies?: Record<string, unknown>;
      };
      for (const name of [
        ...Object.keys(parsed.dependencies ?? {}),
        ...Object.keys(parsed.devDependencies ?? {}),
      ]) {
        packages.add(name);
      }
    } catch {
      // A malformed nested manifest should not hide valid manifests.
    }
  }
  return packages;
}

function endpointProvider(
  node: ArchitectureNode,
  packages: ReadonlySet<string>,
): string | undefined {
  const framework = node.metadata?.framework;
  if (typeof framework === "string" && framework) return framework;
  if (node.technology === "next-app-router") return "next";
  if (node.technology === "openapi" || node.technology === "swagger") {
    return node.technology;
  }
  if (node.technology && node.technology !== "http") return node.technology;
  if ([...unsupportedNodePackages].some((name) => packages.has(name))) {
    return undefined;
  }
  if (packages.has("express")) return "express";
  return undefined;
}

function endpointFacet(
  node: ArchitectureNode,
  packages: ReadonlySet<string>,
): EndpointFacet | undefined {
  if (node.kind !== "route") return undefined;
  const method = node.metadata?.method;
  const routePath = node.metadata?.path;
  if (typeof method !== "string" || typeof routePath !== "string") {
    return undefined;
  }
  const provider = endpointProvider(node, packages);
  if (!provider) return undefined;
  const operationId = node.metadata?.operationId;
  const summary = node.metadata?.summary;
  return {
    kind: "endpoint",
    protocol: "http",
    method: method.toUpperCase(),
    path: routePath,
    provider,
    declaration:
      provider === "openapi" || provider === "swagger" ? "contract" : "code",
    ...(typeof operationId === "string" && operationId
      ? { operationId }
      : {}),
    ...(typeof summary === "string" && summary ? { summary } : {}),
  };
}

function nearestFastApiHandler(
  route: ArchitectureNode,
  nodes: readonly ArchitectureNode[],
): ArchitectureNode | undefined {
  const evidence = route.evidence[0];
  const routeLine = evidence?.range?.startLine;
  if (!evidence || !routeLine) return undefined;
  const lineFor = (node: ArchitectureNode): number =>
    node.evidence.find((candidate) => candidate.file === evidence.file)
      ?.range?.startLine ?? Number.MAX_SAFE_INTEGER;
  return nodes
    .filter((node) => {
      if (node.kind !== "function") return false;
      const item = node.evidence.find((candidate) => candidate.file === evidence.file);
      const line = item?.range?.startLine;
      return typeof line === "number" && line > routeLine && line - routeLine <= 20;
    })
    .sort((left, right) => lineFor(left) - lineFor(right))[0];
}

export const httpEndpointAdapter: SemanticAdapter = {
  id: "http-endpoints",
  version: "0.2.0",
  capability: "http-api",
  extensions: new Set([".json"]),

  async extract(context) {
    const packages = await nodePackages(context.files);
    const nodes: ArchitectureNode[] = [];
    const edges: ArchitectureEdge[] = [];
    for (const node of context.nodes) {
      if (node.semantics?.some((facet) => facet.kind === "endpoint")) continue;
      const endpoint = endpointFacet(node, packages);
      const source = node.evidence[0];
      if (!endpoint || !source) continue;
      nodes.push({
        ...node,
        semantics: [endpoint],
        metadata: {},
        evidence: [{
          ...source,
          extractor: this.id,
          certainty: "derived",
          detail: `Normalized ${endpoint.provider} ${endpoint.method} ${endpoint.path} endpoint`,
        }],
      });
      if (
        endpoint.provider === "fastapi" &&
        !context.edges.some((edge) => edge.kind === "routes-to" && edge.source === node.id)
      ) {
        const handler = nearestFastApiHandler(node, context.nodes);
        if (handler) {
          edges.push(edgeFrom("routes-to", node.id, handler.id, {
            ...source,
            extractor: this.id,
            certainty: "derived",
            detail: `FastAPI decorator binds to ${handler.label}`,
          }));
        }
      }
    }

    return {
      adapter: {
        id: this.id,
        version: this.version,
        capability: this.capability,
      },
      nodes,
      edges,
      diagnostics: [],
    };
  },
};
