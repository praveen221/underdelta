import { readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { edgeFrom, relativeFile, stableId } from "../graph.js";
import type {
  ArchitectureExtractor,
  ExtractionContext,
} from "../extractor.js";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  Evidence,
  NodeKind,
  SourceRange,
} from "../schema.js";

const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"]);
const httpMethods = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
]);
const writeMethods = new Set([
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
]);
const readMethods = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "aggregate",
  "count",
  "groupBy",
]);

interface ParsedFile {
  absolute: string;
  relative: string;
  source: ts.SourceFile;
  moduleId: string;
}

function rangeFor(source: ts.SourceFile, node: ts.Node): SourceRange {
  const start = source.getLineAndCharacterOfPosition(node.getStart(source));
  const end = source.getLineAndCharacterOfPosition(node.getEnd());
  return {
    startLine: start.line + 1,
    startColumn: start.character,
    endLine: end.line + 1,
    endColumn: end.character,
  };
}

function evidenceFor(
  file: ParsedFile,
  node: ts.Node,
  certainty: Evidence["certainty"] = "observed",
  detail?: string,
): Evidence {
  const evidence: Evidence = {
    file: file.relative,
    range: rangeFor(file.source, node),
    extractor: "typescript",
    certainty,
  };
  if (detail !== undefined) evidence.detail = detail;
  return evidence;
}

function containsJsx(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (
      ts.isJsxElement(child) ||
      ts.isJsxSelfClosingElement(child) ||
      ts.isJsxFragment(child)
    ) {
      found = true;
      return;
    }
    if (!found) ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function callableKind(name: string, node: ts.Node): NodeKind {
  if (/^use[A-Z0-9]/.test(name)) return "hook";
  if (/^[A-Z]/.test(name) && containsJsx(node)) return "component";
  return "function";
}

function stringValue(node: ts.Expression | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function propertyChain(node: ts.Expression): string[] {
  if (ts.isIdentifier(node)) return [node.text];
  if (ts.isPropertyAccessExpression(node)) {
    return [...propertyChain(node.expression), node.name.text];
  }
  return [];
}

function resolveRelativeImport(
  fromFile: ParsedFile,
  specifier: string,
  modules: Map<string, string>,
): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = path.resolve(path.dirname(fromFile.absolute), specifier);
  const candidates = [
    base,
    ...[...extensions].map((extension) => `${base}${extension}`),
    ...[...extensions].map((extension) => path.join(base, `index${extension}`)),
  ];
  for (const candidate of candidates) {
    const id = modules.get(path.normalize(candidate));
    if (id) return id;
  }
  return undefined;
}

export const typescriptExtractor: ArchitectureExtractor = {
  id: "typescript",
  version: "0.1.0",
  extensions,

  async extract(context: ExtractionContext) {
    const nodes: ArchitectureNode[] = [];
    const edges: ArchitectureEdge[] = [];
    const parsed: ParsedFile[] = await Promise.all(
      context.files.map(async (absolute) => {
        const relative = relativeFile(context.root, absolute);
        const contents = await readFile(absolute, "utf8");
        const source = ts.createSourceFile(
          absolute,
          contents,
          ts.ScriptTarget.Latest,
          true,
          absolute.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        );
        return {
          absolute,
          relative,
          source,
          moduleId: stableId("module", relative),
        };
      }),
    );

    const moduleByAbsolute = new Map(
      parsed.map((file) => [path.normalize(file.absolute), file.moduleId]),
    );
    const declarationsByFile = new Map<string, Map<string, string>>();
    const declarationsByName = new Map<string, string[]>();

    for (const file of parsed) {
      nodes.push({
        id: file.moduleId,
        kind: "module",
        label: file.relative,
        qualifiedName: file.relative,
        metadata: { language: "typescript" },
        evidence: [
          {
            file: file.relative,
            extractor: "typescript",
            certainty: "observed",
          },
        ],
      });

      const declarations = new Map<string, string>();
      declarationsByFile.set(file.relative, declarations);

      const addCallable = (
        name: string,
        node: ts.Node,
        parentId = file.moduleId,
      ): string => {
        const kind = callableKind(name, node);
        const id = stableId(kind, file.relative, name);
        declarations.set(name, id);
        const byName = declarationsByName.get(name) ?? [];
        byName.push(id);
        declarationsByName.set(name, byName);
        nodes.push({
          id,
          kind,
          label: name,
          qualifiedName: `${file.relative}#${name}`,
          parentId,
          metadata: {},
          evidence: [evidenceFor(file, node)],
        });
        edges.push(edgeFrom("contains", parentId, id, evidenceFor(file, node)));
        return id;
      };

      const visitDeclarations = (node: ts.Node, parentId?: string): void => {
        if (ts.isClassDeclaration(node) && node.name) {
          const id = stableId("service", file.relative, node.name.text);
          declarations.set(node.name.text, id);
          const byName = declarationsByName.get(node.name.text) ?? [];
          byName.push(id);
          declarationsByName.set(node.name.text, byName);
          nodes.push({
            id,
            kind: /service$/i.test(node.name.text) ? "service" : "module",
            label: node.name.text,
            qualifiedName: `${file.relative}#${node.name.text}`,
            parentId: file.moduleId,
            metadata: { declaration: "class" },
            evidence: [evidenceFor(file, node)],
          });
          edges.push(
            edgeFrom("contains", file.moduleId, id, evidenceFor(file, node)),
          );
          ts.forEachChild(node, (child) => visitDeclarations(child, id));
          return;
        }

        if (ts.isMethodDeclaration(node) && node.name) {
          addCallable(node.name.getText(file.source), node, parentId);
        } else if (ts.isFunctionDeclaration(node) && node.name) {
          addCallable(node.name.text, node, parentId);
        } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
          if (
            node.initializer &&
            (ts.isArrowFunction(node.initializer) ||
              ts.isFunctionExpression(node.initializer))
          ) {
            addCallable(node.name.text, node, parentId);
          }
        }
        ts.forEachChild(node, (child) => visitDeclarations(child, parentId));
      };
      visitDeclarations(file.source);
    }

    const uniqueDeclaration = (name: string): string | undefined => {
      const candidates = declarationsByName.get(name);
      return candidates?.length === 1 ? candidates[0] : undefined;
    };

    for (const file of parsed) {
      const localDeclarations =
        declarationsByFile.get(file.relative) ?? new Map<string, string>();

      const visit = (node: ts.Node, ownerId = file.moduleId): void => {
        let nextOwner = ownerId;
        if (ts.isFunctionDeclaration(node) && node.name) {
          nextOwner = localDeclarations.get(node.name.text) ?? ownerId;
        } else if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.initializer &&
          (ts.isArrowFunction(node.initializer) ||
            ts.isFunctionExpression(node.initializer))
        ) {
          nextOwner = localDeclarations.get(node.name.text) ?? ownerId;
        } else if (ts.isMethodDeclaration(node) && node.name) {
          nextOwner =
            localDeclarations.get(node.name.getText(file.source)) ?? ownerId;
        }

        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          const target = resolveRelativeImport(
            file,
            node.moduleSpecifier.text,
            moduleByAbsolute,
          );
          if (target) {
            edges.push(
              edgeFrom("imports", file.moduleId, target, evidenceFor(file, node)),
            );
          }
        }

        if (ts.isJsxOpeningLikeElement(node)) {
          const name = node.tagName.getText(file.source);
          if (/^[A-Z]/.test(name)) {
            const target =
              localDeclarations.get(name) ?? uniqueDeclaration(name);
            if (target) {
              edges.push(
                edgeFrom("renders", ownerId, target, evidenceFor(file, node)),
              );
            }
          }
        }

        if (ts.isCallExpression(node)) {
          const chain = propertyChain(node.expression);
          const method = chain.at(-1);
          const receiver = chain.at(-2);

          if (method && httpMethods.has(method)) {
            const routePath = stringValue(node.arguments[0]);
            if (routePath) {
              const routeId = stableId(
                "route",
                file.relative,
                method.toUpperCase(),
                routePath,
              );
              nodes.push({
                id: routeId,
                kind: "route",
                label: `${method.toUpperCase()} ${routePath}`,
                parentId: file.moduleId,
                technology: "http",
                metadata: { method: method.toUpperCase(), path: routePath },
                evidence: [evidenceFor(file, node)],
              });
              edges.push(
                edgeFrom(
                  "contains",
                  file.moduleId,
                  routeId,
                  evidenceFor(file, node),
                ),
              );
              const handler = node.arguments.at(-1);
              if (handler && ts.isIdentifier(handler)) {
                const target =
                  localDeclarations.get(handler.text) ??
                  uniqueDeclaration(handler.text);
                if (target) {
                  edges.push(
                    edgeFrom(
                      "routes-to",
                      routeId,
                      target,
                      evidenceFor(file, handler),
                    ),
                  );
                }
              }
            }
          }

          if (method === "schedule" || method === "cron") {
            const expression = stringValue(node.arguments[0]);
            if (expression) {
              const cronId = stableId("cron", file.relative, expression);
              nodes.push({
                id: cronId,
                kind: "cron",
                label: expression,
                parentId: file.moduleId,
                technology: receiver ?? "scheduler",
                metadata: { expression },
                evidence: [evidenceFor(file, node)],
              });
              edges.push(
                edgeFrom(
                  "contains",
                  file.moduleId,
                  cronId,
                  evidenceFor(file, node),
                ),
              );
              const handler = node.arguments[1];
              if (handler && ts.isIdentifier(handler)) {
                const target =
                  localDeclarations.get(handler.text) ??
                  uniqueDeclaration(handler.text);
                if (target) {
                  edges.push(
                    edgeFrom(
                      "schedules",
                      cronId,
                      target,
                      evidenceFor(file, handler),
                    ),
                  );
                }
              }
            }
          }

          if (chain[0] === "prisma" && chain.length >= 3 && method) {
            const model = chain.at(-2);
            if (model) {
              const tableId = stableId("table", "prisma", model);
              nodes.push({
                id: tableId,
                kind: "table",
                label: model,
                technology: "prisma",
                metadata: { discoveredFromUsage: true },
                evidence: [
                  evidenceFor(
                    file,
                    node,
                    "derived",
                    `Prisma model used through ${chain.join(".")}`,
                  ),
                ],
              });
              const kind = writeMethods.has(method)
                ? "writes"
                : readMethods.has(method)
                  ? "reads"
                  : "queries";
              edges.push(
                edgeFrom(
                  kind,
                  ownerId,
                  tableId,
                  evidenceFor(file, node, "derived"),
                ),
              );
            }
          }

          if (ts.isIdentifier(node.expression)) {
            const target =
              localDeclarations.get(node.expression.text) ??
              uniqueDeclaration(node.expression.text);
            if (target && target !== ownerId) {
              edges.push(
                edgeFrom("calls", ownerId, target, evidenceFor(file, node)),
              );
            }
          }
        }

        if (
          ts.isNewExpression(node) &&
          ts.isIdentifier(node.expression) &&
          (node.expression.text === "Queue" || node.expression.text === "Worker")
        ) {
          const queueName = stringValue(node.arguments?.[0]);
          if (queueName) {
            const queueId = stableId("queue", queueName);
            nodes.push({
              id: queueId,
              kind: "queue",
              label: queueName,
              technology: "queue",
              metadata: {},
              evidence: [evidenceFor(file, node, "derived")],
            });
            edges.push(
              edgeFrom(
                node.expression.text === "Worker" ? "consumes" : "uses",
                ownerId,
                queueId,
                evidenceFor(file, node, "derived"),
              ),
            );
          }
        }

        ts.forEachChild(node, (child) => visit(child, nextOwner));
      };
      visit(file.source);
    }

    return {
      extractor: { id: this.id, version: this.version },
      nodes,
      edges,
      diagnostics: [],
    };
  },
};
