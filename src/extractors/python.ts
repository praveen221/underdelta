import { readFile } from "node:fs/promises";
import { edgeFrom, relativeFile, stableId } from "../graph.js";
import type { ArchitectureExtractor } from "../extractor.js";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  Evidence,
} from "../schema.js";

const extensions = new Set([".py"]);

const fastapiMethods = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
]);

/** FastAPI / Starlette decorator receivers that declare HTTP routes. */
const fastapiReceivers = new Set([
  "app",
  "api",
  "router",
  "api_router",
  "application",
]);

function evidenceAt(
  file: string,
  source: string,
  offset: number,
  detail?: string,
): Evidence {
  const before = source.slice(0, offset);
  const line = before.split(/\r?\n/).length;
  const evidence: Evidence = {
    file,
    range: {
      startLine: line,
      startColumn: 0,
      endLine: line,
      endColumn: 0,
    },
    extractor: "python",
    certainty: "observed",
  };
  if (detail !== undefined) evidence.detail = detail;
  return evidence;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  // Django path converters / raw strings: r"^articles/$"
  if (
    (trimmed.startsWith('r"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("r'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(2, -1);
  }
  return trimmed;
}

/** Normalize Django/FastAPI path strings into HTTP-shaped labels. */
function normalizeRoutePath(raw: string): string {
  let path = raw.trim();
  // Strip Django regex anchors from re_path / url().
  path = path.replace(/^\^/, "").replace(/\$$/, "");
  if (!path.startsWith("/")) path = `/${path}`;
  // Collapse accidental double slashes except protocol (N/A here).
  path = path.replace(/\/{2,}/g, "/");
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) || "/" : path;
}

function looksLikeRoutePath(value: string): boolean {
  const path = value.trim();
  if (!path) return false;
  // FastAPI paths are usually "/articles"; Django may be "articles/" or r"^…$".
  if (path.startsWith("/") || path.startsWith("^") || path.startsWith("*")) {
    return true;
  }
  // Bare Django path fragments like "articles/" or "<int:pk>/".
  return /^[A-Za-z0-9_.:<>\[\]|+()-]+(?:\/[A-Za-z0-9_.:<>\[\]|+()-]*)*\/?$/.test(
    path,
  );
}

function pushRoute(
  nodes: ArchitectureNode[],
  edges: ArchitectureEdge[],
  args: {
    file: string;
    moduleId: string;
    method: string;
    path: string;
    technology: string;
    evidence: Evidence;
    framework: string;
  },
): void {
  const method = args.method.toUpperCase();
  const routePath = normalizeRoutePath(args.path);
  const routeId = stableId("route", args.file, method, routePath);
  nodes.push({
    id: routeId,
    kind: "route",
    label: `${method} ${routePath}`,
    parentId: args.moduleId,
    technology: args.technology,
    metadata: {
      method,
      path: routePath,
      framework: args.framework,
    },
    evidence: [args.evidence],
  });
  edges.push(
    edgeFrom("contains", args.moduleId, routeId, args.evidence),
  );
}

/**
 * FastAPI / APIRouter decorator routes:
 *   @app.get("/health")
 *   @router.post("/items/{item_id}")
 *   @api_router.delete("/x")
 */
function extractFastapiRoutes(
  file: string,
  source: string,
  moduleId: string,
  nodes: ArchitectureNode[],
  edges: ArchitectureEdge[],
): void {
  const pattern =
    /@([A-Za-z_][\w]*)\.(get|post|put|patch|delete|head|options|trace)\s*\(\s*(["'][^"']*["'])/gi;
  for (const match of source.matchAll(pattern)) {
    const receiver = match[1];
    const method = match[2];
    const rawPath = match[3];
    if (!receiver || !method || !rawPath || match.index === undefined) continue;
    if (!fastapiReceivers.has(receiver.toLowerCase())) continue;
    if (!fastapiMethods.has(method.toLowerCase())) continue;
    const pathValue = unquote(rawPath);
    if (!looksLikeRoutePath(pathValue)) continue;
    pushRoute(nodes, edges, {
      file,
      moduleId,
      method,
      path: pathValue,
      technology: "fastapi",
      framework: "fastapi",
      evidence: evidenceAt(
        file,
        source,
        match.index,
        `FastAPI @${receiver}.${method.toLowerCase()} route`,
      ),
    });
  }

  // @app.api_route("/path", methods=["GET", "POST"])
  const apiRoutePattern =
    /@([A-Za-z_][\w]*)\.api_route\s*\(\s*(["'][^"']*["'])\s*,\s*methods\s*=\s*\[([^\]]+)\]/gi;
  for (const match of source.matchAll(apiRoutePattern)) {
    const receiver = match[1];
    const rawPath = match[2];
    const methodsBlob = match[3];
    if (!receiver || !rawPath || !methodsBlob || match.index === undefined) {
      continue;
    }
    if (!fastapiReceivers.has(receiver.toLowerCase())) continue;
    const pathValue = unquote(rawPath);
    if (!looksLikeRoutePath(pathValue)) continue;
    const methods = [...methodsBlob.matchAll(/["']([A-Za-z]+)["']/g)].map(
      (item) => item[1]!.toUpperCase(),
    );
    for (const method of methods) {
      pushRoute(nodes, edges, {
        file,
        moduleId,
        method,
        path: pathValue,
        technology: "fastapi",
        framework: "fastapi",
        evidence: evidenceAt(
          file,
          source,
          match.index,
          `FastAPI @${receiver}.api_route route`,
        ),
      });
    }
  }
}

/**
 * Django urlpatterns entries:
 *   path("articles/", views.list_articles)
 *   re_path(r"^articles/$", views.list_articles)
 *   url(r"^health/$", views.health)  # legacy
 */
function extractDjangoRoutes(
  file: string,
  source: string,
  moduleId: string,
  nodes: ArchitectureNode[],
  edges: ArchitectureEdge[],
): void {
  const pattern =
    /\b(path|re_path|url)\s*\(\s*(r?["'][^"']*["'])\s*,/gi;
  for (const match of source.matchAll(pattern)) {
    const helper = match[1];
    const rawPath = match[2];
    if (!helper || !rawPath || match.index === undefined) continue;
    const pathValue = unquote(rawPath);
    if (!looksLikeRoutePath(pathValue)) continue;
    // Django path()/re_path() declare URL routes (method often unspecified).
    pushRoute(nodes, edges, {
      file,
      moduleId,
      method: "ANY",
      path: pathValue,
      technology: "django",
      framework: "django",
      evidence: evidenceAt(
        file,
        source,
        match.index,
        `Django ${helper}() urlpattern`,
      ),
    });
  }
}

export const pythonExtractor: ArchitectureExtractor = {
  id: "python",
  version: "0.1.0",
  extensions,

  async extract(context) {
    const nodes: ArchitectureNode[] = [];
    const edges: ArchitectureEdge[] = [];

    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      // Skip generated / vendored Python noise even if discovery walked them.
      if (
        file.includes("/__pycache__/") ||
        file.endsWith(".pyc") ||
        /(^|\/)(?:\.venv|venv|site-packages)\//.test(file)
      ) {
        continue;
      }

      const source = await readFile(absolute, "utf8");
      const moduleId = stableId("module", file);
      nodes.push({
        id: moduleId,
        kind: "module",
        label: file,
        technology: "python",
        metadata: { file, language: "python" },
        evidence: [
          {
            file,
            extractor: "python",
            certainty: "observed",
            detail: "Python source module",
          },
        ],
      });

      extractFastapiRoutes(file, source, moduleId, nodes, edges);
      extractDjangoRoutes(file, source, moduleId, nodes, edges);
    }

    return {
      extractor: { id: "python", version: "0.1.0" },
      nodes,
      edges,
    };
  },
};
