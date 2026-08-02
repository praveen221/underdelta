import { readFile } from "node:fs/promises";
import { edgeFrom, relativeFile, stableId } from "../graph.js";
import type { ArchitectureExtractor } from "../extractor.js";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  Evidence,
} from "../schema.js";

const sdlExtensions = new Set([".graphql", ".gql"]);
const codeExtensions = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);
const extensions = new Set([...sdlExtensions, ...codeExtensions]);

type OperationType = "query" | "mutation" | "subscription";

interface ParsedOperation {
  operationType: OperationType;
  /** Schema field name, or document operation name / first selected field. */
  field: string;
  operationName?: string;
  offset: number;
  sourceKind: "sdl" | "gql";
}

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
    extractor: "graphql",
    certainty: "observed",
  };
  if (detail) item.detail = detail;
  return item;
}

/** Conventional GraphQL schema / document filenames. */
export function isGraphqlSchemaPath(file: string): boolean {
  const normalized = file.replaceAll("\\", "/").toLowerCase();
  return (
    /\.(?:graphql|gql)$/.test(normalized) ||
    /(?:^|\/)graphql\//.test(normalized)
  );
}

/**
 * Strip comments/strings lightly so JSDoc / string docs cannot invent gql ops.
 * Good enough for tagged-template scanning; not a full JS lexer.
 */
function maskNoise(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];

    // Line comment
    if (ch === "/" && next === "/") {
      out += "  ";
      i += 2;
      while (i < source.length && source[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    // Block comment
    if (ch === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < source.length) {
        if (source[i] === "*" && source[i + 1] === "/") {
          out += "  ";
          i += 2;
          break;
        }
        out += source[i] === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }
    // Strings — keep length/newlines, drop contents (except template bodies we need).
    // Tagged templates are handled separately by scanning the original source;
    // here we only mask quotes so bare `query` words inside strings don't match SDL.
    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += " ";
      i++;
      while (i < source.length) {
        if (source[i] === "\\") {
          out += "  ";
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          out += " ";
          i++;
          break;
        }
        out += source[i] === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

function titleOperation(op: OperationType): string {
  return op.charAt(0).toUpperCase() + op.slice(1);
}

/**
 * Walk `type Query|Mutation|Subscription { … }` SDL blocks and collect fields.
 * Handles block comments / # line comments and nested braces in args/types.
 */
function parseSchemaTypeFields(source: string): ParsedOperation[] {
  const operations: ParsedOperation[] = [];
  const typePattern =
    /\btype\s+(Query|Mutation|Subscription)\s*(?:@[^\n{]*)*\{/g;
  for (const match of source.matchAll(typePattern)) {
    const operationType = (match[1] ?? "").toLowerCase() as OperationType;
    if (!operationType) continue;
    const braceStart = (match.index ?? 0) + match[0].length - 1;
    const body = readBalancedBlock(source, braceStart);
    if (!body) continue;

    let i = 0;
    const text = body.inner;
    while (i < text.length) {
      // Skip whitespace / commas
      if (/\s|,/.test(text[i]!)) {
        i++;
        continue;
      }
      // # comments
      if (text[i] === "#") {
        while (i < text.length && text[i] !== "\n") i++;
        continue;
      }
      // """ or " descriptions
      if (text.startsWith('"""', i)) {
        i += 3;
        const end = text.indexOf('"""', i);
        i = end < 0 ? text.length : end + 3;
        continue;
      }
      if (text[i] === '"') {
        i++;
        while (i < text.length && text[i] !== '"') {
          if (text[i] === "\\") i += 2;
          else i++;
        }
        i++;
        continue;
      }
      // Directives / implements leftovers
      if (text[i] === "@") {
        while (i < text.length && !/\s/.test(text[i]!)) i++;
        continue;
      }

      const fieldMatch = /^([A-Za-z_][\w]*)/.exec(text.slice(i));
      if (!fieldMatch?.[1]) {
        i++;
        continue;
      }
      const field = fieldMatch[1];
      // Skip GraphQL keywords that can appear oddly; keep normal fields.
      if (field === "type" || field === "implements" || field === "extend") {
        i += field.length;
        continue;
      }
      const absoluteOffset = body.contentStart + i;
      operations.push({
        operationType,
        field,
        offset: absoluteOffset,
        sourceKind: "sdl",
      });
      i += field.length;
      // Skip the rest of the field definition (args, type, directives).
      let depth = 0;
      while (i < text.length) {
        const c = text[i]!;
        if (c === "(" || c === "{" || c === "[") depth++;
        else if (c === ")" || c === "}" || c === "]") {
          depth = Math.max(0, depth - 1);
        } else if ((c === "\n" || c === ",") && depth === 0) {
          i++;
          break;
        }
        i++;
      }
    }
  }
  return operations;
}

function readBalancedBlock(
  source: string,
  openBraceIndex: number,
): { inner: string; contentStart: number } | undefined {
  if (source[openBraceIndex] !== "{") return undefined;
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return {
          inner: source.slice(openBraceIndex + 1, i),
          contentStart: openBraceIndex + 1,
        };
      }
    }
  }
  return undefined;
}

/**
 * Extract operations from gql`…` / graphql`…` tagged templates.
 * Captures named ops (`query ListNotes { notes { id } }`) and falls back to
 * the first selected field when the operation is anonymous.
 */
function parseGqlTaggedOperations(source: string): ParsedOperation[] {
  const operations: ParsedOperation[] = [];
  const tagPattern = /\b(?:gql|graphql)\s*`([\s\S]*?)`/g;
  for (const match of source.matchAll(tagPattern)) {
    const body = match[1] ?? "";
    const tagOffset = match.index ?? 0;
    const opMatch =
      /\b(query|mutation|subscription)\b(?:\s+([A-Za-z_][\w]*))?/.exec(body);
    if (!opMatch?.[1]) continue;
    const operationType = opMatch[1].toLowerCase() as OperationType;
    const operationName = opMatch[2];
    let field = operationName ?? "";
    if (!field) {
      // First selection set field after the operation keyword.
      const selection = /\{[\s\S]*?\b([A-Za-z_][\w]*)\b/.exec(body);
      field = selection?.[1] ?? operationType;
    }
    const innerOffset = opMatch.index ?? 0;
    operations.push({
      operationType,
      field,
      ...(operationName ? { operationName } : {}),
      offset: tagOffset + 1 + innerOffset, // past opening `
      sourceKind: "gql",
    });
  }
  return operations;
}

function parseGraphqlSource(
  source: string,
  file: string,
): ParsedOperation[] {
  const lower = file.toLowerCase();
  if (lower.endsWith(".graphql") || lower.endsWith(".gql")) {
    return parseSchemaTypeFields(source);
  }
  // Code: prefer tagged templates; also accept embedded SDL type blocks
  // (schema-as-string builders sometimes inline `type Query { … }`).
  const masked = maskNoise(source);
  const fromTags = parseGqlTaggedOperations(source);
  const fromSdl = parseSchemaTypeFields(masked);
  return [...fromTags, ...fromSdl];
}

export const graphqlExtractor: ArchitectureExtractor = {
  id: "graphql",
  version: "0.1.0",
  extensions,

  async extract(context) {
    const nodes: ArchitectureNode[] = [];
    const edges: ArchitectureEdge[] = [];
    const seen = new Set<string>();

    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      let source: string;
      try {
        source = await readFile(absolute, "utf8");
      } catch {
        continue;
      }

      const operations = parseGraphqlSource(source, file);
      const isSchemaFile = isGraphqlSchemaPath(file);
      if (!operations.length && !isSchemaFile) continue;

      // Only emit a GraphQL module node when we saw schema/document surface.
      const shouldEmitModule =
        isSchemaFile ||
        operations.some((op) => op.sourceKind === "sdl") ||
        operations.length > 0;
      if (!shouldEmitModule) continue;

      const moduleId = stableId("module", "graphql", file);
      const moduleEvidence = evidence(
        file,
        source,
        0,
        isSchemaFile ? "GraphQL schema" : "GraphQL operations",
      );
      if (!seen.has(moduleId)) {
        seen.add(moduleId);
        nodes.push({
          id: moduleId,
          kind: "module",
          label: file,
          qualifiedName: file,
          technology: "graphql",
          metadata: {
            graphqlSpec: isSchemaFile || operations.some((o) => o.sourceKind === "sdl"),
            graphqlModule: true,
          },
          evidence: [moduleEvidence],
        });
      }

      for (const op of operations) {
        const routeId = stableId(
          "route",
          "graphql",
          file,
          op.operationType,
          op.field,
          op.operationName ?? "",
          op.sourceKind,
        );
        if (seen.has(routeId)) continue;
        seen.add(routeId);

        const detail = op.operationName
          ? `${op.operationType} ${op.operationName} (${op.field})`
          : `${op.operationType} ${op.field}`;
        const routeEvidence = evidence(file, source, op.offset, detail);
        const label = `${titleOperation(op.operationType)} ${op.field}`;
        nodes.push({
          id: routeId,
          kind: "route",
          label,
          technology: "graphql",
          parentId: moduleId,
          metadata: {
            graphql: true,
            operationType: op.operationType,
            field: op.field,
            method: op.operationType.toUpperCase(),
            path: op.field,
            sourceKind: op.sourceKind,
            ...(op.operationName ? { operationName: op.operationName } : {}),
          },
          evidence: [routeEvidence],
        });
        edges.push(edgeFrom("exposes", moduleId, routeId, routeEvidence));
      }
    }

    return {
      extractor: { id: "graphql", version: "0.1.0" },
      nodes,
      edges,
      diagnostics: [],
    };
  },
};
