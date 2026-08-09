import { edgeFrom } from "../graph.js";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  Evidence,
} from "../schema.js";

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function modulePath(node: ArchitectureNode): string {
  return normalizePath(node.qualifiedName ?? node.label);
}

const PRODUCT_ACRONYMS = new Set([
  "ai",
  "api",
  "rag",
  "llm",
  "sql",
  "http",
  "https",
  "url",
  "uri",
  "id",
  "uuid",
  "jwt",
  "oauth",
  "db",
  "ui",
  "ux",
  "css",
  "html",
  "json",
  "xml",
  "aws",
  "gcp",
  "s3",
  "cdn",
  "sms",
  "gpu",
  "cpu",
  "io",
  "vpc",
  "nat",
  "eip",
  "dynamodb",
  "iam",
  "ec2",
  "ecs",
  "eks",
  "rds",
  "opentelemetry",
]);

const MIXED_CASE_ACRONYMS: Record<string, string> = {
  oauth: "OAuth",
  dynamodb: "DynamoDB",
  opentelemetry: "OpenTelemetry",
};

function formatProductWord(part: string, index: number): string {
  const lower = part.toLowerCase();
  if (PRODUCT_ACRONYMS.has(lower)) {
    return MIXED_CASE_ACRONYMS[lower] ?? lower.toUpperCase();
  }
  if (index === 0) {
    return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
  }
  return lower;
}

function humanizeIdentifierLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed || /\s/.test(trimmed)) return trimmed;
  const spaced = trimmed
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return trimmed;
  return spaced
    .split(" ")
    .map((part, index) => formatProductWord(part, index))
    .join(" ");
}

function appRouterRouteSegment(path: string): string {
  const trimmed = path.trim() || "/";
  if (!trimmed.startsWith("/")) return `/${trimmed}`;
  if (trimmed === "/") return "/";
  const segments = trimmed
    .split("/")
    .filter(Boolean)
    .filter((segment) => !segment.startsWith("(") && !segment.startsWith("@"));
  if (!segments.length) return "/";
  return `/${segments[0]}`;
}

function pageMoleculeSystemKey(segment: string): string {
  return `page:${segment}`;
}

/** Server-action / client-API label -> story edge kind (mutations write; getters read). */
function serverActionStoryEdgeKind(label: string): "reads" | "writes" {
  const normalized = label.toLowerCase();
  // Word tokens ("List posts") and camelCase / snake prefixes (listPosts, get_user).
  if (
    /\b(get|list|find|fetch|load|read|query|show|select)\b/.test(normalized) ||
    /^(get|list|find|fetch|load|read|query|show|select)([a-z0-9]|_)/i.test(
      label.replace(/\s+/g, ""),
    )
  ) {
    return "reads";
  }
  return "writes";
}

/** Client API helpers under `apis/**` (axios/fetch wrappers), not server actions. */
export function isClientApiFunction(
  node: ArchitectureNode,
  nodes: Map<string, ArchitectureNode>,
): boolean {
  if (node.metadata?.serverAction === true) return false;
  if (node.kind !== "function" && node.kind !== "hook") return false;
  for (const item of node.evidence) {
    const file = normalizePath(item.file);
    if (/(^|\/)apis\//.test(file)) return true;
  }
  const parent = node.parentId ? nodes.get(node.parentId) : undefined;
  if (parent?.kind === "module" && /(^|\/)apis\//.test(modulePath(parent))) {
    return true;
  }
  return false;
}

/**
 * True when HTTP API is only client `apis/**` helpers (axios/fetch wrappers to a
 * remote backend) -- no in-repo route handlers, server actions, or OpenAPI/GraphQL
 * contracts. Scholar-style FE twins use this shape; they must not invent
 * page->API `uses` for hubs that never call a helper.
 */
export function isClientApisOnlyHttpApi(
  api: ArchitectureNode,
  nodes: Map<string, ArchitectureNode>,
): boolean {
  if (api.metadata?.systemKey !== "api") return false;

  const ownedByApi = (nodeId: string): boolean => {
    let current: string | undefined = nodeId;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      if (current === api.id) return true;
      const node = nodes.get(current);
      if (!node) return false;
      current = node.parentId;
    }
    return false;
  };

  let sawClientApi = false;
  let sawServerSurface = false;
  for (const node of nodes.values()) {
    if (node.id === api.id) continue;
    if (!ownedByApi(node.id)) continue;

    if (
      node.kind === "route" ||
      node.metadata?.serverAction === true ||
      node.metadata?.openapi === true ||
      node.metadata?.graphql === true
    ) {
      sawServerSurface = true;
      break;
    }
    if (isClientApiFunction(node, nodes)) {
      sawClientApi = true;
      continue;
    }
    if (node.kind === "module" && /(^|\/)apis\//.test(modulePath(node))) {
      sawClientApi = true;
    }
  }
  return sawClientApi && !sawServerSurface;
}

/**
 * Resolve the page-molecule systemKey for an FE caller (feature root, page
 * atom, or default-export page body). Scholar-style pages often call `apis/**`
 * from the page body component without a separate featureRoot flag.
 */
function pageMoleculeKeyForCaller(
  source: ArchitectureNode,
  nodes: Map<string, ArchitectureNode>,
  pageBodyToPage: Map<string, string>,
): string | undefined {
  const keyFrom = (node: ArchitectureNode | undefined): string | undefined => {
    if (!node) return undefined;
    if (typeof node.metadata?.routeMolecule === "string") {
      return node.metadata.routeMolecule;
    }
    if (
      typeof node.metadata?.projectedSystem === "string" &&
      String(node.metadata.projectedSystem).startsWith("page:")
    ) {
      return String(node.metadata.projectedSystem);
    }
    return undefined;
  };

  const direct = keyFrom(source);
  if (direct) return direct;

  if (source.kind === "page") {
    const fromPath =
      typeof source.metadata?.path === "string"
        ? pageMoleculeSystemKey(appRouterRouteSegment(String(source.metadata.path)))
        : undefined;
    if (fromPath) return fromPath;
  }

  const pageId = pageBodyToPage.get(source.id);
  if (pageId) {
    const fromPage = keyFrom(nodes.get(pageId));
    if (fromPage) return fromPage;
    const page = nodes.get(pageId);
    if (page?.kind === "page" && typeof page.metadata?.path === "string") {
      return pageMoleculeSystemKey(
        appRouterRouteSegment(String(page.metadata.path)),
      );
    }
  }

  // Walk parents for a page atom / already-projected page molecule member.
  let current: string | undefined = source.parentId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = nodes.get(current);
    if (!node) break;
    const fromAncestor = keyFrom(node);
    if (fromAncestor) return fromAncestor;
    if (node.kind === "page" && typeof node.metadata?.path === "string") {
      return pageMoleculeSystemKey(
        appRouterRouteSegment(String(node.metadata.path)),
      );
    }
    current = node.parentId;
  }
  return undefined;
}

/**
 * FE story edges from pages (deterministic, evidence-backed):
 * - `renders` page atom -> page-owned feature root (lifted from page-body JSX)
 * - `reads`/`writes` page molecule -> API when a page-owned caller (feature root
 *   or page body / page atom) calls a server action under the API system
 * - `reads`/`writes` page molecule -> API when such a caller calls a client
 *   `apis/**` helper (Next/SaaS axios/fetch wrappers; Scholar-shaped pages)
 */
export function liftFePageStoryEdges(
  nodes: Map<string, ArchitectureNode>,
  edges: Map<string, ArchitectureEdge>,
  systems: Map<string, ArchitectureNode>,
): void {
  const api = systems.get("api");

  // page body component id -> owning page atom
  const pageBodyToPage = new Map<string, string>();
  for (const node of nodes.values()) {
    if (node.kind !== "component" || !node.parentId) continue;
    const parent = nodes.get(node.parentId);
    if (parent?.kind === "page") {
      pageBodyToPage.set(node.id, parent.id);
    }
  }

  // Lift JSX renders onto the page atom so the catalog edge is page->feature.
  for (const edge of [...edges.values()]) {
    if (edge.kind !== "renders") continue;
    const pageId = pageBodyToPage.get(edge.source);
    if (!pageId) continue;
    const target = nodes.get(edge.target);
    if (!target || target.kind !== "component") continue;
    if (target.metadata?.featureRoot !== true) continue;
    const page = nodes.get(pageId);
    if (!page) continue;
    const seed = edge.evidence[0]!;
    const lifted = edgeFrom(
      "renders",
      pageId,
      target.id,
      {
        ...seed,
        extractor: "projection",
        certainty: "derived",
        detail:
          seed.detail ??
          `${page.label} page renders feature root ${target.label}`,
      },
      edge.label,
    );
    if (!edges.has(lifted.id)) edges.set(lifted.id, lifted);
  }

  if (!api) return;

  const liftMoleculeApiStory = (
    source: ArchitectureNode,
    target: ArchitectureNode,
    seed: Evidence,
    via: string,
  ): void => {
    const moleculeKey = pageMoleculeKeyForCaller(source, nodes, pageBodyToPage);
    if (!moleculeKey) return;
    const molecule = systems.get(moleculeKey);
    if (!molecule) return;

    const targetLabel = humanizeIdentifierLabel(target.label);
    const kind = serverActionStoryEdgeKind(targetLabel);
    const lifted = edgeFrom(
      kind,
      molecule.id,
      api.id,
      {
        ...seed,
        extractor: "projection",
        certainty: "derived",
        detail: `${molecule.label} ${kind} ${api.label} via ${source.label} → ${targetLabel} (${via})`,
      },
      targetLabel,
    );
    if (!edges.has(lifted.id)) edges.set(lifted.id, lifted);
  };

  // Page molecule -> API reads/writes from page-owned caller -> serverAction.
  for (const edge of [...edges.values()]) {
    if (edge.kind !== "calls") continue;
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) continue;
    if (target.metadata?.serverAction !== true) continue;
    if (target.parentId !== api.id) continue;
    // Prefer page-owned callers (feature root, page body, page atom).
    if (
      source.metadata?.featureRoot !== true &&
      source.kind !== "page" &&
      !pageBodyToPage.has(source.id) &&
      !pageMoleculeKeyForCaller(source, nodes, pageBodyToPage)
    ) {
      continue;
    }
    liftMoleculeApiStory(
      source,
      target,
      edge.evidence[0]!,
      "server action",
    );
  }

  // Page molecule -> API from page-owned caller -> client `apis/**` helpers.
  // Scholar: default-export page bodies call helpers without featureRoot=true.
  for (const edge of [...edges.values()]) {
    if (edge.kind !== "calls") continue;
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) continue;
    if (!isClientApiFunction(target, nodes)) continue;
    if (!pageMoleculeKeyForCaller(source, nodes, pageBodyToPage)) continue;
    liftMoleculeApiStory(
      source,
      target,
      edge.evidence[0]!,
      "client apis module",
    );
  }
}
