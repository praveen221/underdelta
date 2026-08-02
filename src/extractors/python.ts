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
  let routePath = raw.trim();
  // Strip Django regex anchors from re_path / url().
  routePath = routePath.replace(/^\^/, "").replace(/\$$/, "");
  if (!routePath.startsWith("/")) routePath = `/${routePath}`;
  // Collapse accidental double slashes except protocol (N/A here).
  routePath = routePath.replace(/\/{2,}/g, "/");
  return routePath.length > 1 && routePath.endsWith("/")
    ? routePath.slice(0, -1) || "/"
    : routePath;
}

/**
 * Join an APIRouter/include_router prefix with a decorator path.
 * FastAPI treats `""` as "exactly the prefix".
 */
function joinRoutePrefix(prefix: string, routePath: string): string {
  const base = prefix.trim();
  const leaf = routePath.trim();
  if (!base || base === "/") {
    return normalizeRoutePath(leaf === "" ? "/" : leaf);
  }
  if (!leaf || leaf === "/") {
    return normalizeRoutePath(base);
  }
  const trimmedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const trimmedLeaf = leaf.startsWith("/") ? leaf : `/${leaf}`;
  return normalizeRoutePath(`${trimmedBase}${trimmedLeaf}`);
}

function looksLikeRoutePath(value: string, allowEmpty = false): boolean {
  const routePath = value.trim();
  if (!routePath) return allowEmpty;
  // FastAPI paths are usually "/articles"; Django may be "articles/" or r"^…$".
  if (
    routePath.startsWith("/") ||
    routePath.startsWith("^") ||
    routePath.startsWith("*")
  ) {
    return true;
  }
  // Bare Django path fragments like "articles/" or "<int:pk>/".
  return /^[A-Za-z0-9_.:<>\[\]|+()-]+(?:\/[A-Za-z0-9_.:<>\[\]|+()-]*)*\/?$/.test(
    routePath,
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
  edges.push(edgeFrom("contains", args.moduleId, routeId, args.evidence));
}

function normalizeRel(file: string): string {
  return file.replaceAll("\\", "/");
}

/** Map dotted Python module path → candidate relative file paths. */
function modulePathCandidates(modulePath: string): string[] {
  const rel = modulePath.replaceAll(".", "/");
  return [`${rel}.py`, `${rel}/__init__.py`];
}

function extractKwPrefix(callArgs: string): string | undefined {
  // prefix="/users" or prefix='/users'
  const literal = /\bprefix\s*=\s*(["'][^"']*["'])/.exec(callArgs);
  if (literal?.[1]) return unquote(literal[1]);
  return undefined;
}

function extractKwPrefixExpr(callArgs: string): string | undefined {
  // prefix=settings.api_prefix (resolved later via project constants)
  const attr = /\bprefix\s*=\s*([A-Za-z_][\w.]*)/.exec(callArgs);
  if (!attr?.[1]) return undefined;
  if (/^["']/.test(attr[1])) return undefined;
  return attr[1];
}

interface FileModel {
  file: string;
  source: string;
  /** Local name → module path (from import statements). */
  imports: Map<string, string>;
  /** Local alias → { modulePath, exportedName } for `from x import router as api_router`. */
  symbolImports: Map<string, { modulePath: string; exportedName: string }>;
  /** router var → own prefix from APIRouter(prefix=...). */
  routerOwnPrefix: Map<string, string>;
}

interface IncludeEdge {
  parentFile: string;
  /** Target file owning the included router. */
  childFile: string;
  /** Router variable name in the child file (usually "router"). */
  childRouterVar: string;
  prefix: string;
}

function parseImports(source: string): {
  imports: Map<string, string>;
  symbolImports: Map<string, { modulePath: string; exportedName: string }>;
} {
  const imports = new Map<string, string>();
  const symbolImports = new Map<
    string,
    { modulePath: string; exportedName: string }
  >();

  // from app.api.routes import authentication, comments
  // from app.api.routes.articles import api as articles
  const fromImport =
    /^from\s+([A-Za-z_][\w.]*)\s+import\s+(.+)$/gm;
  for (const match of source.matchAll(fromImport)) {
    const modulePath = match[1];
    const namesBlob = match[2];
    if (!modulePath || !namesBlob) continue;
    // Strip trailing comments / parentheses noise — keep it simple.
    const cleaned = namesBlob.split("#")[0] ?? namesBlob;
    for (const part of cleaned.split(",")) {
      const piece = part.trim();
      if (!piece || piece.startsWith("(") || piece === ")") continue;
      const asMatch = /^([A-Za-z_][\w]*)\s+as\s+([A-Za-z_][\w]*)$/.exec(piece);
      const bare = /^([A-Za-z_][\w]*)$/.exec(piece);
      if (asMatch) {
        const exportedName = asMatch[1]!;
        const local = asMatch[2]!;
        // from pkg import api as articles → articles is a module submodule
        // OR from pkg import router as api_router → symbol import
        if (exportedName === "router" || exportedName === "api_router") {
          symbolImports.set(local, { modulePath, exportedName });
        } else {
          imports.set(local, `${modulePath}.${exportedName}`);
        }
      } else if (bare) {
        const name = bare[1]!;
        if (name === "router" || name === "api_router") {
          symbolImports.set(name, { modulePath, exportedName: name });
        } else {
          imports.set(name, `${modulePath}.${name}`);
        }
      }
    }
  }

  // import app.api.routes.authentication as authentication
  const importAs = /^import\s+([A-Za-z_][\w.]*)\s+as\s+([A-Za-z_][\w]*)/gm;
  for (const match of source.matchAll(importAs)) {
    if (match[1] && match[2]) imports.set(match[2], match[1]);
  }

  return { imports, symbolImports };
}

function parseFileModel(file: string, source: string): FileModel {
  const { imports, symbolImports } = parseImports(source);
  const routerOwnPrefix = new Map<string, string>();
  const routerAssign =
    /\b([A-Za-z_][\w]*)\s*=\s*APIRouter\s*\(([^)]*)\)/g;
  for (const match of source.matchAll(routerAssign)) {
    const varName = match[1];
    const args = match[2] ?? "";
    if (!varName) continue;
    routerOwnPrefix.set(varName, extractKwPrefix(args) ?? "");
  }
  // FastAPI() apps also mount routers — treat as prefix roots with no own prefix.
  const appAssign = /\b([A-Za-z_][\w]*)\s*=\s*FastAPI\s*\(/g;
  for (const match of source.matchAll(appAssign)) {
    const varName = match[1];
    if (!varName) continue;
    if (!routerOwnPrefix.has(varName)) routerOwnPrefix.set(varName, "");
  }
  return { file, source, imports, symbolImports, routerOwnPrefix };
}

function resolveModuleFile(
  modulePath: string,
  filesByRel: Map<string, FileModel>,
): string | undefined {
  for (const candidate of modulePathCandidates(modulePath)) {
    const norm = normalizeRel(candidate);
    if (filesByRel.has(norm)) return norm;
  }
  return undefined;
}

function resolveIncludeTarget(
  parent: FileModel,
  targetExpr: string,
  filesByRel: Map<string, FileModel>,
): { file: string; routerVar: string } | undefined {
  // authentication.router
  const dotted = /^([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)$/.exec(targetExpr);
  if (dotted) {
    const local = dotted[1]!;
    const attr = dotted[2]!;
    const modulePath = parent.imports.get(local);
    if (!modulePath) return undefined;
    const file = resolveModuleFile(modulePath, filesByRel);
    if (!file) return undefined;
    return { file, routerVar: attr };
  }

  // api_router (imported symbol)
  const bare = /^([A-Za-z_][\w]*)$/.exec(targetExpr);
  if (bare) {
    const local = bare[1]!;
    const symbol = parent.symbolImports.get(local);
    if (symbol) {
      const file = resolveModuleFile(symbol.modulePath, filesByRel);
      if (!file) return undefined;
      return { file, routerVar: symbol.exportedName };
    }
    // Same-file router mount: app.include_router(router, ...)
    if (parent.routerOwnPrefix.has(local)) {
      return { file: parent.file, routerVar: local };
    }
  }
  return undefined;
}

function collectStringConstants(models: FileModel[]): Map<string, string> {
  const constants = new Map<string, string>();
  for (const model of models) {
    // api_prefix: str = "/api"  OR  api_prefix = "/api"
    const pattern =
      /\b([A-Za-z_][\w]*)\s*(?::\s*[A-Za-z_][\w\[\], |]*)?\s*=\s*(["'][^"']*["'])/g;
    for (const match of model.source.matchAll(pattern)) {
      const name = match[1];
      const raw = match[2];
      if (!name || !raw) continue;
      // Only keep path-ish settings we care about for include_router.
      if (!/prefix$/i.test(name)) continue;
      constants.set(name, unquote(raw));
    }
  }
  return constants;
}

function resolvePrefixValue(
  callArgs: string,
  constants: Map<string, string>,
): string {
  const literal = extractKwPrefix(callArgs);
  if (literal !== undefined) return literal;
  const expr = extractKwPrefixExpr(callArgs);
  if (!expr) return "";
  // settings.api_prefix → api_prefix
  const attr = expr.includes(".") ? expr.slice(expr.lastIndexOf(".") + 1) : expr;
  return constants.get(attr) ?? "";
}

function collectIncludeEdges(
  models: FileModel[],
  filesByRel: Map<string, FileModel>,
  constants: Map<string, string>,
): IncludeEdge[] {
  const edges: IncludeEdge[] = [];
  const includePattern =
    /\b([A-Za-z_][\w]*)\.include_router\s*\(\s*([A-Za-z_][\w.]*)\s*([^)]*)\)/g;
  for (const model of models) {
    for (const match of model.source.matchAll(includePattern)) {
      const targetExpr = match[2];
      const callArgs = match[3] ?? "";
      if (!targetExpr) continue;
      const target = resolveIncludeTarget(model, targetExpr, filesByRel);
      if (!target) continue;
      edges.push({
        parentFile: model.file,
        childFile: target.file,
        childRouterVar: target.routerVar,
        prefix: resolvePrefixValue(callArgs, constants),
      });
    }
  }
  return edges;
}

/**
 * Cumulative mount prefix for each file's router/app variable.
 * Walks include_router edges from roots and concatenates prefixes.
 */
function computeRouterPrefixes(
  models: FileModel[],
  includeEdges: IncludeEdge[],
): Map<string, string> {
  // key: `${file}::${routerVar}` → cumulative prefix
  const cumulative = new Map<string, string>();
  const own = new Map<string, string>();
  for (const model of models) {
    for (const [varName, prefix] of model.routerOwnPrefix) {
      const key = `${model.file}::${varName}`;
      own.set(key, prefix);
      cumulative.set(key, prefix);
    }
  }

  const parents = new Map<
    string,
    Array<{ parentKey: string; edgePrefix: string }>
  >();
  for (const edge of includeEdges) {
    const childKey = `${edge.childFile}::${edge.childRouterVar}`;
    const parentModel = models.find((item) => item.file === edge.parentFile);
    if (!parentModel) continue;
    let parentKey: string | undefined;
    for (const varName of parentModel.routerOwnPrefix.keys()) {
      parentKey = `${edge.parentFile}::${varName}`;
      break;
    }
    if (!parentKey) {
      parentKey = `${edge.parentFile}::__mount__`;
      if (!cumulative.has(parentKey)) cumulative.set(parentKey, "");
    }
    const list = parents.get(childKey) ?? [];
    list.push({ parentKey, edgePrefix: edge.prefix });
    parents.set(childKey, list);
  }

  const visiting = new Set<string>();
  const resolved = new Set<string>();

  function mountOwn(parentMounted: string, ownPrefix: string): string {
    if (!ownPrefix || ownPrefix === "/") return parentMounted;
    return joinRoutePrefix(parentMounted, ownPrefix);
  }

  function resolve(key: string): string {
    if (resolved.has(key)) return cumulative.get(key) ?? "";
    if (visiting.has(key)) return cumulative.get(key) ?? "";
    visiting.add(key);
    const ownPrefix = own.get(key) ?? "";
    const parentList = parents.get(key) ?? [];
    let best = ownPrefix;
    if (parentList.length === 0) {
      best = ownPrefix;
    } else {
      best = "";
      for (const parent of parentList) {
        const parentMounted = joinRoutePrefix(
          resolve(parent.parentKey),
          parent.edgePrefix,
        );
        const mounted = mountOwn(parentMounted, ownPrefix);
        if (mounted.length >= best.length) best = mounted;
      }
    }
    const normalized = !best || best === "/" ? "" : best;
    cumulative.set(key, normalized);
    visiting.delete(key);
    resolved.add(key);
    return normalized;
  }

  for (const key of cumulative.keys()) resolve(key);
  for (const key of parents.keys()) resolve(key);

  // Per-file default (`router` preferred) plus full `${file}::${var}` keys.
  const out = new Map<string, string>();
  for (const [key, prefix] of cumulative) out.set(key, prefix);
  for (const model of models) {
    const routerKey = `${model.file}::router`;
    if (cumulative.has(routerKey)) {
      out.set(model.file, cumulative.get(routerKey) ?? "");
      continue;
    }
    let fallback = "";
    for (const varName of model.routerOwnPrefix.keys()) {
      fallback = cumulative.get(`${model.file}::${varName}`) ?? "";
      break;
    }
    out.set(model.file, fallback);
  }
  return out;
}

function prefixForReceiver(
  prefixes: Map<string, string>,
  file: string,
  receiver: string,
): string {
  const specific = prefixes.get(`${file}::${receiver}`);
  if (specific !== undefined) return specific;
  return prefixes.get(file) ?? "";
}

/**
 * FastAPI / APIRouter decorator routes:
 *   @app.get("/health")
 *   @router.post("/items/{item_id}")
 *   @router.get("")  # empty = mount prefix only
 *   @api_router.delete("/x")
 */
function extractFastapiRoutes(
  file: string,
  source: string,
  moduleId: string,
  nodes: ArchitectureNode[],
  edges: ArchitectureEdge[],
  prefixes: Map<string, string>,
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
    // FastAPI allows "" (mount root); Django bare paths still need shape checks.
    if (!looksLikeRoutePath(pathValue, true)) continue;
    const mounted = joinRoutePrefix(
      prefixForReceiver(prefixes, file, receiver),
      pathValue,
    );
    pushRoute(nodes, edges, {
      file,
      moduleId,
      method,
      path: mounted,
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
    if (!looksLikeRoutePath(pathValue, true)) continue;
    const mounted = joinRoutePrefix(
      prefixForReceiver(prefixes, file, receiver),
      pathValue,
    );
    const methods = [...methodsBlob.matchAll(/["']([A-Za-z]+)["']/g)].map(
      (item) => item[1]!.toUpperCase(),
    );
    for (const method of methods) {
      pushRoute(nodes, edges, {
        file,
        moduleId,
        method,
        path: mounted,
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
    const models: FileModel[] = [];
    const filesByRel = new Map<string, FileModel>();

    for (const absolute of context.files) {
      const file = normalizeRel(relativeFile(context.root, absolute));
      // Skip generated / vendored Python noise even if discovery walked them.
      if (
        file.includes("/__pycache__/") ||
        file.endsWith(".pyc") ||
        /(^|\/)(?:\.venv|venv|site-packages)\//.test(file)
      ) {
        continue;
      }

      const source = await readFile(absolute, "utf8");
      const model = parseFileModel(file, source);
      models.push(model);
      filesByRel.set(file, model);
    }

    const constants = collectStringConstants(models);
    const includeEdges = collectIncludeEdges(models, filesByRel, constants);
    const prefixes = computeRouterPrefixes(models, includeEdges);

    for (const model of models) {
      const moduleId = stableId("module", model.file);
      nodes.push({
        id: moduleId,
        kind: "module",
        label: model.file,
        technology: "python",
        metadata: { file: model.file, language: "python" },
        evidence: [
          {
            file: model.file,
            extractor: "python",
            certainty: "observed",
            detail: "Python source module",
          },
        ],
      });

      extractFastapiRoutes(
        model.file,
        model.source,
        moduleId,
        nodes,
        edges,
        prefixes,
      );
      extractDjangoRoutes(model.file, model.source, moduleId, nodes, edges);
    }

    return {
      extractor: { id: "python", version: "0.1.0" },
      nodes,
      edges,
    };
  },
};
