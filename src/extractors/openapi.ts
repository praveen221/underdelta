import { readFile } from "node:fs/promises";
import { edgeFrom, relativeFile, stableId } from "../graph.js";
import type { ArchitectureExtractor } from "../extractor.js";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  Evidence,
} from "../schema.js";

const extensions = new Set([".yaml", ".yml", ".json"]);

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace",
]);

function evidence(
  file: string,
  source: string,
  offset: number,
  detail?: string,
): Evidence {
  const before = source.slice(0, offset);
  const line = before.split(/\r?\n/).length;
  const item: Evidence = {
    file,
    range: {
      startLine: line,
      startColumn: 0,
      endLine: line,
      endColumn: 0,
    },
    extractor: "openapi",
    certainty: "observed",
  };
  if (detail) item.detail = detail;
  return item;
}

/** Conventional OpenAPI / Swagger filenames (and files under openapi/). */
export function isOpenApiSpecPath(file: string): boolean {
  const normalized = file.replaceAll("\\", "/").toLowerCase();
  return (
    /(^|\/)(openapi|swagger)\.(json|ya?ml)$/.test(normalized) ||
    /(?:^|\/)openapi\/.+\.(json|ya?ml)$/.test(normalized)
  );
}

function looksLikeOpenApiDocument(source: string, file: string): boolean {
  if (isOpenApiSpecPath(file)) return true;
  const head = source.slice(0, 800);
  if (/^\s*openapi\s*:/m.test(head) || /^\s*swagger\s*:/m.test(head)) {
    return true;
  }
  try {
    const doc = JSON.parse(source) as Record<string, unknown>;
    return typeof doc.openapi === "string" || typeof doc.swagger === "string";
  } catch {
    return false;
  }
}

interface ParsedOperation {
  path: string;
  method: string;
  summary?: string;
  operationId?: string;
  offset: number;
}

function joinBasePath(basePath: string | undefined, routePath: string): string {
  if (!basePath || basePath === "/") return routePath;
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  if (routePath.startsWith(base + "/") || routePath === base) return routePath;
  return routePath.startsWith("/") ? `${base}${routePath}` : `${base}/${routePath}`;
}

function parseJsonOperations(source: string): {
  operations: ParsedOperation[];
  title?: string;
  technology: "openapi" | "swagger";
} {
  const doc = JSON.parse(source) as {
    openapi?: string;
    swagger?: string;
    info?: { title?: string };
    basePath?: string;
    paths?: Record<string, Record<string, unknown>>;
  };
  const technology: "openapi" | "swagger" =
    typeof doc.swagger === "string" ? "swagger" : "openapi";
  const title =
    typeof doc.info?.title === "string" ? doc.info.title.trim() : undefined;
  const operations: ParsedOperation[] = [];
  const paths = doc.paths ?? {};
  for (const [rawPath, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    const routePath = joinBasePath(doc.basePath, rawPath);
    // Approximate offset from first path occurrence for evidence lines.
    const pathOffset = source.indexOf(`"${rawPath}"`);
    const fallbackOffset = pathOffset >= 0 ? pathOffset : 0;
    for (const [key, value] of Object.entries(pathItem)) {
      const method = key.toLowerCase();
      if (!HTTP_METHODS.has(method)) continue;
      if (!value || typeof value !== "object") continue;
      const op = value as { summary?: string; operationId?: string };
      const methodOffset = source.indexOf(`"${key}"`, fallbackOffset);
      operations.push({
        path: routePath,
        method: method.toUpperCase(),
        ...(typeof op.summary === "string" ? { summary: op.summary } : {}),
        ...(typeof op.operationId === "string"
          ? { operationId: op.operationId }
          : {}),
        offset: methodOffset >= 0 ? methodOffset : fallbackOffset,
      });
    }
  }
  return { operations, ...(title ? { title } : {}), technology };
}

function unquoteYamlScalar(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, "").trim();
}

/**
 * Lightweight YAML paths walker — enough for typical OpenAPI/Swagger specs
 * without pulling in a YAML dependency. Handles quoted/unquoted path keys and
 * HTTP method blocks; skips $ref-only path items.
 */
function parseYamlOperations(source: string): {
  operations: ParsedOperation[];
  title?: string;
  technology: "openapi" | "swagger";
} {
  const technology: "openapi" | "swagger" = /^\s*swagger\s*:/m.test(source)
    ? "swagger"
    : "openapi";
  const titleMatch = /^\s*title\s*:\s*(.+)$/m.exec(source);
  const title = titleMatch?.[1]
    ? unquoteYamlScalar(titleMatch[1])
    : undefined;

  const baseMatch = /^\s*basePath\s*:\s*(.+)$/m.exec(source);
  const basePath = baseMatch?.[1]
    ? unquoteYamlScalar(baseMatch[1])
    : undefined;

  const lines = source.split(/\r?\n/);
  let offset = 0;
  let inPaths = false;
  let pathsIndent = -1;
  let currentPath: string | undefined;
  let pathIndent = -1;
  const operations: ParsedOperation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineOffset = offset;
    offset += line.length + 1;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (!inPaths) {
      if (/^paths\s*:\s*$/.test(trimmed)) {
        inPaths = true;
        pathsIndent = indent;
      }
      continue;
    }

    // Left the paths: block (next top-level key at same/less indent).
    if (
      indent <= pathsIndent &&
      /^[A-Za-z_][\w]*\s*:/.test(trimmed) &&
      !trimmed.startsWith("/")
    ) {
      inPaths = false;
      currentPath = undefined;
      continue;
    }

    // Path key: /notes: or '/notes/{id}': or "/notes":
    const pathKey = trimmed.match(
      /^(['"]?)(\/[^'"]*)\1\s*:\s*(?:\{\s*\}\s*)?$/,
    );
    if (pathKey?.[2] && indent > pathsIndent) {
      currentPath = joinBasePath(basePath, pathKey[2]);
      pathIndent = indent;
      continue;
    }

    if (!currentPath || indent <= pathIndent) continue;

    const methodMatch = trimmed.match(
      /^(get|post|put|patch|delete|options|head|trace)\s*:\s*$/i,
    );
    if (!methodMatch?.[1]) continue;

    const method = methodMatch[1].toUpperCase();
    const methodIndent = indent;
    let summary: string | undefined;
    let operationId: string | undefined;
    for (let j = i + 1; j < lines.length; j++) {
      const peek = lines[j] ?? "";
      const peekTrim = peek.trim();
      const peekIndent = peek.match(/^\s*/)?.[0].length ?? 0;
      if (!peekTrim || peekTrim.startsWith("#")) continue;
      if (peekIndent <= methodIndent) break;
      const summaryHit = /^summary\s*:\s*(.+)$/.exec(peekTrim);
      if (summaryHit?.[1]) summary = unquoteYamlScalar(summaryHit[1]);
      const opHit = /^operationId\s*:\s*(.+)$/.exec(peekTrim);
      if (opHit?.[1]) operationId = unquoteYamlScalar(opHit[1]);
    }

    operations.push({
      path: currentPath,
      method,
      offset: lineOffset + indent,
      ...(summary ? { summary } : {}),
      ...(operationId ? { operationId } : {}),
    });
  }

  return { operations, ...(title ? { title } : {}), technology };
}

function parseOperations(
  source: string,
  file: string,
): {
  operations: ParsedOperation[];
  title?: string;
  technology: "openapi" | "swagger";
} {
  if (file.toLowerCase().endsWith(".json")) {
    return parseJsonOperations(source);
  }
  return parseYamlOperations(source);
}

export const openapiExtractor: ArchitectureExtractor = {
  id: "openapi",
  version: "0.1.0",
  extensions,

  async extract(context) {
    const nodes: ArchitectureNode[] = [];
    const edges: ArchitectureEdge[] = [];

    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      let source: string;
      try {
        source = await readFile(absolute, "utf8");
      } catch {
        continue;
      }
      if (!looksLikeOpenApiDocument(source, file)) continue;

      let parsed: {
        operations: ParsedOperation[];
        title?: string;
        technology: "openapi" | "swagger";
      };
      try {
        parsed = parseOperations(source, file);
      } catch {
        continue;
      }
      if (!parsed.operations.length && !isOpenApiSpecPath(file)) continue;

      const moduleId = stableId("module", "openapi", file);
      const moduleEvidence = evidence(
        file,
        source,
        0,
        `${parsed.technology} specification`,
      );
      nodes.push({
        id: moduleId,
        kind: "module",
        label: file,
        qualifiedName: file,
        technology: parsed.technology,
        metadata: {
          openapiSpec: true,
          ...(parsed.title ? { openapiTitle: parsed.title } : {}),
        },
        evidence: [moduleEvidence],
      });

      for (const op of parsed.operations) {
        const routeId = stableId(
          "route",
          "openapi",
          file,
          op.method,
          op.path,
        );
        const routeEvidence = evidence(
          file,
          source,
          op.offset,
          op.operationId
            ? `${op.method} ${op.path} (${op.operationId})`
            : `${op.method} ${op.path}`,
        );
        nodes.push({
          id: routeId,
          kind: "route",
          label: `${op.method} ${op.path}`,
          technology: parsed.technology,
          parentId: moduleId,
          metadata: {
            method: op.method,
            path: op.path,
            openapi: true,
            ...(op.operationId ? { operationId: op.operationId } : {}),
            ...(op.summary ? { summary: op.summary } : {}),
          },
          evidence: [routeEvidence],
        });
        edges.push(edgeFrom("exposes", moduleId, routeId, routeEvidence));
      }
    }

    return {
      extractor: { id: "openapi", version: "0.1.0" },
      nodes,
      edges,
      diagnostics: [],
    };
  },
};
