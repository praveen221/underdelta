import { readFile } from "node:fs/promises";
import path from "node:path";
import { ts } from "ts-morph";
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
import {
  accessFromRouteGroups,
  pathMatchesProtectedPrefix,
  protectedPrefixesFromMiddleware,
} from "../feShells.js";

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

/** Express/Fastify-style paths start with `/` or `*`; Map.get("cli") does not. */
function looksLikeHttpRoutePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("*");
}

const nextHttpExports = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

const nextAppSpecialFiles = new Set([
  "page",
  "layout",
  "route",
  "loading",
  "error",
  "template",
  "default",
]);

interface NextAppFile {
  type: string;
  urlPath: string;
  /** App Router `(group)` folder names, e.g. `(public)`, `(auth)`. */
  routeGroups: string[];
}

/** Parse Next.js App Router special files under `app/` or `src/app/`. */
function parseNextAppFile(relative: string): NextAppFile | undefined {
  const file = relative.replaceAll("\\", "/");
  const match = file.match(
    /(?:^|\/)(?:src\/)?app\/(?:(.+)\/)?(page|layout|route|loading|error|template|default)\.[cm]?[jt]sx?$/i,
  );
  if (!match) return undefined;
  const rawSegments = (match[1] ?? "").split("/").filter(Boolean);
  const routeGroups = rawSegments.filter(
    (segment) => segment.startsWith("(") && segment.endsWith(")"),
  );
  const urlSegments = rawSegments.filter(
    (segment) =>
      !(segment.startsWith("(") && segment.endsWith(")")) &&
      !segment.startsWith("@") &&
      !segment.startsWith("_"),
  );
  const urlPath =
    urlSegments.length === 0 ? "/" : `/${urlSegments.join("/")}`;
  return {
    type: match[2]!.toLowerCase(),
    urlPath,
    routeGroups,
  };
}

function isCreateRouterCall(node: ts.CallExpression): boolean {
  if (ts.isIdentifier(node.expression)) {
    return node.expression.text === "createRouter";
  }
  if (ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.name.text === "createRouter";
  }
  return false;
}

/** Resolve an array literal from an expression or a same-file const binding. */
function resolveArrayLiteral(
  expression: ts.Expression | undefined,
  source: ts.SourceFile,
): ts.ArrayLiteralExpression | undefined {
  if (!expression) return undefined;
  if (ts.isArrayLiteralExpression(expression)) return expression;
  if (!ts.isIdentifier(expression)) return undefined;
  const name = expression.text;
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer &&
        ts.isArrayLiteralExpression(declaration.initializer)
      ) {
        return declaration.initializer;
      }
    }
  }
  return undefined;
}

function objectProperty(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  for (const property of object.properties) {
    // Vue fixtures often write `createRouter({ history, routes })`.
    if (ts.isShorthandPropertyAssignment(property)) {
      if (property.name.text === name) return property.name;
      continue;
    }
    if (!ts.isPropertyAssignment(property)) continue;
    const key = property.name;
    const keyText = ts.isIdentifier(key)
      ? key.text
      : ts.isStringLiteralLike(key)
        ? key.text
        : undefined;
    if (keyText === name) return property.initializer;
  }
  return undefined;
}

/**
 * Lazy Vue route components: `() => import('./views/Home.vue')`.
 * Returns the module specifier when statically visible.
 */
function lazyImportSpecifier(expression: ts.Expression): string | undefined {
  if (!ts.isArrowFunction(expression) && !ts.isFunctionExpression(expression)) {
    return undefined;
  }
  let call: ts.CallExpression | undefined;
  if (ts.isCallExpression(expression.body)) {
    call = expression.body;
  } else if (ts.isBlock(expression.body)) {
    for (const statement of expression.body.statements) {
      if (
        ts.isReturnStatement(statement) &&
        statement.expression &&
        ts.isCallExpression(statement.expression)
      ) {
        call = statement.expression;
        break;
      }
    }
  }
  if (!call) return undefined;
  // Dynamic `import("…")` uses SyntaxKind.ImportKeyword as the callee.
  if (call.expression.kind !== ts.SyntaxKind.ImportKeyword) return undefined;
  return stringValue(call.arguments[0]);
}

interface VueRouteRecord {
  path: string;
  name?: string;
  componentName?: string;
  componentSpecifier?: string;
  at: ts.Node;
}

function collectVueRouteRecords(
  elements: ts.NodeArray<ts.Expression>,
  parentPath = "",
): VueRouteRecord[] {
  const records: VueRouteRecord[] = [];
  for (const element of elements) {
    if (!ts.isObjectLiteralExpression(element)) continue;
    const pathExpr = objectProperty(element, "path");
    const pathValue = stringValue(pathExpr);
    if (pathValue === undefined) continue;

    let path = pathValue;
    if (!path.startsWith("/")) {
      const base = parentPath.endsWith("/")
        ? parentPath.slice(0, -1)
        : parentPath || "";
      path = path === "" ? parentPath || "/" : `${base}/${path}`.replace(/\/+/g, "/");
      if (!path.startsWith("/")) path = `/${path}`;
    }

    const nameValue = stringValue(objectProperty(element, "name"));
    const componentExpr = objectProperty(element, "component");
    let componentName: string | undefined;
    let componentSpecifier: string | undefined;
    if (componentExpr) {
      if (ts.isIdentifier(componentExpr)) {
        componentName = componentExpr.text;
      } else {
        componentSpecifier = lazyImportSpecifier(componentExpr);
      }
    }

    const record: VueRouteRecord = {
      path,
      at: element,
    };
    if (nameValue !== undefined) record.name = nameValue;
    if (componentName !== undefined) record.componentName = componentName;
    if (componentSpecifier !== undefined) {
      record.componentSpecifier = componentSpecifier;
    }
    records.push(record);

    const childrenExpr = objectProperty(element, "children");
    if (childrenExpr && ts.isArrayLiteralExpression(childrenExpr)) {
      records.push(...collectVueRouteRecords(childrenExpr.elements, path));
    }
  }
  return records;
}

/** Leading `"use client"` / `"use server"` directive, if present. */
function readUseDirective(
  source: ts.SourceFile,
): "client" | "server" | undefined {
  for (const statement of source.statements) {
    if (
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression)
    ) {
      const value = statement.expression.text;
      if (value === "use client") return "client";
      if (value === "use server") return "server";
      continue;
    }
    break;
  }
  return undefined;
}

function isExportedFunctionLike(
  node: ts.FunctionDeclaration | ts.VariableStatement,
): boolean {
  const modifiers = ts.canHaveModifiers(node)
    ? ts.getModifiers(node)
    : undefined;
  return Boolean(modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

/** True when a CallExpression wraps a function (HOF server-action factories). */
function callWrapsFunction(expression: ts.CallExpression): boolean {
  return expression.arguments.some(
    (argument) =>
      ts.isArrowFunction(argument) ||
      ts.isFunctionExpression(argument) ||
      (ts.isCallExpression(argument) && callWrapsFunction(argument)),
  );
}

/** Exported const initializers that should surface as Next.js server actions. */
function isServerActionInitializer(initializer: ts.Expression): boolean {
  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    return true;
  }
  // saas-starter: validatedAction(schema, async …) / withTeam(async …)
  return ts.isCallExpression(initializer) && callWrapsFunction(initializer);
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
  // TypeScript ESM often writes `import "./x.js"` while the file is `x.ts(x)`.
  const stripped = base.replace(/\.(?:[cm]?[jt]sx?)$/i, "");
  const candidates = [
    base,
    stripped,
    ...[...extensions].map((extension) => `${stripped}${extension}`),
    ...[...extensions].map((extension) => `${base}${extension}`),
    ...[...extensions].map((extension) =>
      path.join(stripped, `index${extension}`),
    ),
    ...[...extensions].map((extension) =>
      path.join(base, `index${extension}`),
    ),
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

    const publishMethods = new Set(["add", "enqueue", "publish", "send", "push"]);

    for (const file of parsed) {
      const localDeclarations =
        declarationsByFile.get(file.relative) ?? new Map<string, string>();
      const queueBindings = new Map<string, string>();

      const ensureQueue = (
        queueName: string,
        at: ts.Node,
      ): string => {
        const queueId = stableId("queue", queueName);
        nodes.push({
          id: queueId,
          kind: "queue",
          label: queueName,
          technology: "queue",
          metadata: {},
          evidence: [evidenceFor(file, at, "derived")],
        });
        return queueId;
      };

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
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.initializer &&
          ts.isNewExpression(node.initializer) &&
          ts.isIdentifier(node.initializer.expression) &&
          node.initializer.expression.text === "Queue"
        ) {
          const queueName = stringValue(node.initializer.arguments?.[0]);
          if (queueName) {
            queueBindings.set(node.name.text, ensureQueue(queueName, node));
          }
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
            // Require an HTTP-shaped path + handler arg so Map.get("x") / Set.delete
            // never become fake Application routes on product diagrams.
            const hasHandlerArg = (node.arguments?.length ?? 0) >= 2;
            if (
              routePath &&
              looksLikeHttpRoutePath(routePath) &&
              hasHandlerArg
            ) {
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

          if (
            method &&
            publishMethods.has(method) &&
            ts.isPropertyAccessExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression)
          ) {
            const binding = node.expression.expression.text;
            const queueId = queueBindings.get(binding);
            if (queueId) {
              edges.push(
                edgeFrom(
                  "publishes",
                  ownerId,
                  queueId,
                  evidenceFor(
                    file,
                    node,
                    "derived",
                    `${binding}.${method} publishes to queue`,
                  ),
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
            const queueId = ensureQueue(queueName, node);
            if (node.expression.text === "Worker") {
              edges.push(
                edgeFrom(
                  "consumes",
                  ownerId,
                  queueId,
                  evidenceFor(
                    file,
                    node,
                    "derived",
                    `Worker consumes queue ${queueName}`,
                  ),
                ),
              );
            } else if (
              !(
                ts.isVariableDeclaration(node.parent) &&
                ts.isIdentifier(node.parent.name)
              )
            ) {
              // Unbound Queue construction still records a publish capability.
              edges.push(
                edgeFrom(
                  "publishes",
                  ownerId,
                  queueId,
                  evidenceFor(
                    file,
                    node,
                    "derived",
                    `Queue ${queueName} constructed for publishing`,
                  ),
                ),
              );
            }
          }
        }

        if (
          ts.isNewExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "Pipeline"
        ) {
          const pipelineName = stringValue(node.arguments?.[0]);
          if (pipelineName) {
            const pipelineId = stableId("pipeline", pipelineName);
            nodes.push({
              id: pipelineId,
              kind: "pipeline",
              label: pipelineName,
              technology: "pipeline",
              metadata: {},
              evidence: [evidenceFor(file, node, "derived")],
            });
            edges.push(
              edgeFrom(
                "uses",
                ownerId,
                pipelineId,
                evidenceFor(file, node, "derived"),
              ),
            );

            let previousStepId: string | undefined;
            const setup = node.arguments?.[1];
            if (setup && ts.isArrowFunction(setup) && ts.isBlock(setup.body)) {
              for (const statement of setup.body.statements) {
                if (
                  !ts.isExpressionStatement(statement) ||
                  !ts.isCallExpression(statement.expression)
                ) {
                  continue;
                }
                const stepCall = statement.expression;
                const stepChain = propertyChain(stepCall.expression);
                if (stepChain.at(-1) !== "step") continue;
                const stepName = stringValue(stepCall.arguments[0]);
                if (!stepName) continue;
                const stepId = stableId(
                  "pipeline-step",
                  pipelineName,
                  stepName,
                );
                nodes.push({
                  id: stepId,
                  kind: "pipeline-step",
                  label: stepName,
                  parentId: pipelineId,
                  technology: "pipeline",
                  metadata: { pipeline: pipelineName },
                  evidence: [evidenceFor(file, stepCall, "derived")],
                });
                edges.push(
                  edgeFrom(
                    "contains",
                    pipelineId,
                    stepId,
                    evidenceFor(file, stepCall, "derived"),
                  ),
                );
                if (previousStepId) {
                  edges.push(
                    edgeFrom(
                      "flows-to",
                      previousStepId,
                      stepId,
                      evidenceFor(file, stepCall, "derived"),
                    ),
                  );
                }
                previousStepId = stepId;
              }
            }
          }
        }

        ts.forEachChild(node, (child) => visit(child, nextOwner));
      };
      visit(file.source);
    }

    // Next.js App Router: pages/layouts + route handlers + client/server split.
    for (const file of parsed) {
      const directive = readUseDirective(file.source);
      const localDeclarations =
        declarationsByFile.get(file.relative) ?? new Map<string, string>();
      const nextFile = parseNextAppFile(file.relative);

      if (directive) {
        for (const node of nodes) {
          if (
            node.evidence.some((item) => item.file === file.relative) &&
            (node.kind === "component" ||
              node.kind === "page" ||
              node.kind === "function" ||
              node.kind === "hook" ||
              node.kind === "module")
          ) {
            node.metadata = {
              ...node.metadata,
              runtime: directive,
              ...(directive === "client" ? { clientComponent: true } : {}),
              ...(directive === "server" ? { serverModule: true } : {}),
            };
          }
        }
      }

      if (directive === "server" || /(?:^|\/)app\/actions?\//i.test(file.relative.replaceAll("\\", "/"))) {
        const markServerAction = (
          name: string,
          at: ts.Node,
        ): void => {
          let id = localDeclarations.get(name);
          let node = id ? nodes.find((item) => item.id === id) : undefined;
          // HOF-wrapped exports (validatedAction/withTeam) were never declared as
          // callables — create the function node so auth/billing mutations appear.
          if (!node) {
            id = stableId("function", file.relative, name);
            node = {
              id,
              kind: "function",
              label: name,
              qualifiedName: `${file.relative}#${name}`,
              parentId: file.moduleId,
              metadata: {},
              evidence: [evidenceFor(file, at)],
            };
            nodes.push(node);
            localDeclarations.set(name, id);
            const byName = declarationsByName.get(name) ?? [];
            byName.push(id);
            declarationsByName.set(name, byName);
            edges.push(
              edgeFrom("contains", file.moduleId, id, evidenceFor(file, at)),
            );
          }
          node.metadata = {
            ...node.metadata,
            serverAction: true,
            runtime: node.metadata?.runtime ?? "server",
          };
          if (!node.technology) node.technology = "next-server-action";
        };

        for (const statement of file.source.statements) {
          if (ts.isFunctionDeclaration(statement) && statement.name) {
            if (!isExportedFunctionLike(statement)) continue;
            markServerAction(statement.name.text, statement);
          } else if (
            ts.isVariableStatement(statement) &&
            isExportedFunctionLike(statement)
          ) {
            for (const declaration of statement.declarationList.declarations) {
              if (!ts.isIdentifier(declaration.name)) continue;
              if (
                !declaration.initializer ||
                !isServerActionInitializer(declaration.initializer)
              ) {
                continue;
              }
              markServerAction(declaration.name.text, declaration);
            }
          }
        }
      }

      if (!nextFile || !nextAppSpecialFiles.has(nextFile.type)) continue;

      if (nextFile.type === "route") {
        for (const statement of file.source.statements) {
          let method: string | undefined;
          let at: ts.Node | undefined;
          let handlerName: string | undefined;
          if (
            ts.isFunctionDeclaration(statement) &&
            statement.name &&
            nextHttpExports.has(statement.name.text)
          ) {
            method = statement.name.text;
            at = statement;
            handlerName = statement.name.text;
          } else if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) {
              if (
                ts.isIdentifier(declaration.name) &&
                nextHttpExports.has(declaration.name.text) &&
                declaration.initializer &&
                (ts.isArrowFunction(declaration.initializer) ||
                  ts.isFunctionExpression(declaration.initializer))
              ) {
                method = declaration.name.text;
                at = declaration;
                handlerName = declaration.name.text;
              }
            }
          }
          if (!method || !at) continue;
          const routePath = nextFile.urlPath;
          const routeId = stableId(
            "route",
            file.relative,
            method,
            routePath,
          );
          nodes.push({
            id: routeId,
            kind: "route",
            label: `${method} ${routePath}`,
            parentId: file.moduleId,
            technology: "next-app-router",
            metadata: {
              method,
              path: routePath,
              next: "route",
              framework: "next",
            },
            evidence: [evidenceFor(file, at, "observed", "Next.js App Router route handler")],
          });
          edges.push(
            edgeFrom(
              "contains",
              file.moduleId,
              routeId,
              evidenceFor(file, at, "observed", "Next.js App Router route handler"),
            ),
          );
          if (handlerName) {
            const target = localDeclarations.get(handlerName);
            if (target) {
              edges.push(
                edgeFrom(
                  "routes-to",
                  routeId,
                  target,
                  evidenceFor(file, at, "derived", "Next.js exported route handler"),
                ),
              );
            }
          }
        }
        continue;
      }

      if (nextFile.type === "page" || nextFile.type === "layout") {
        const kind = nextFile.type === "page" ? "page" : "component";
        const label =
          nextFile.type === "layout"
            ? nextFile.urlPath === "/"
              ? "Root layout"
              : `Layout ${nextFile.urlPath}`
            : nextFile.urlPath === "/"
              ? "Home"
              : nextFile.urlPath;
        const nodeId = stableId(
          kind,
          file.relative,
          nextFile.type,
          nextFile.urlPath,
        );
        const groupAccess = accessFromRouteGroups(nextFile.routeGroups);
        const accessEvidenceDetail = groupAccess
          ? `App Router route group (${groupAccess.group}) → access=${groupAccess.access}`
          : undefined;
        nodes.push({
          id: nodeId,
          kind,
          label,
          qualifiedName: `${file.relative}#${nextFile.type}`,
          parentId: file.moduleId,
          technology: "next-app-router",
          metadata: {
            next: nextFile.type,
            path: nextFile.urlPath,
            framework: "next",
            runtime: directive ?? "server",
            ...(directive === "client" ? { clientComponent: true } : {}),
            ...(nextFile.routeGroups.length
              ? { routeGroups: [...nextFile.routeGroups] }
              : {}),
            ...(groupAccess
              ? {
                  access: groupAccess.access,
                  shell: groupAccess.shell,
                  surface: "story" as const,
                  reachability: "route-tree" as const,
                }
              : {
                  access: "unknown" as const,
                  surface: "story" as const,
                  reachability: "route-tree" as const,
                }),
          },
          evidence: [
            {
              file: file.relative,
              extractor: "typescript",
              certainty: "observed",
              detail:
                nextFile.type === "page"
                  ? `Next.js App Router page ${nextFile.urlPath}`
                  : `Next.js App Router layout ${nextFile.urlPath}`,
            },
            ...(groupAccess && accessEvidenceDetail
              ? [
                  {
                    file: file.relative,
                    extractor: "typescript" as const,
                    certainty: "observed" as const,
                    detail: accessEvidenceDetail,
                  },
                ]
              : []),
          ],
        });
        edges.push(
          edgeFrom("contains", file.moduleId, nodeId, {
            file: file.relative,
            extractor: "typescript",
            certainty: "observed",
            detail: `Next.js App Router ${nextFile.type}`,
          }),
        );

        // Prefer the convention node as parent for default-export page/layout fns.
        for (const node of nodes) {
          if (
            node.parentId === file.moduleId &&
            (node.kind === "component" || node.kind === "function") &&
            node.id !== nodeId &&
            node.evidence.some((item) => item.file === file.relative)
          ) {
            const isLikelyDefaultView =
              node.kind === "component" ||
              /page|layout|home|dashboard/i.test(node.label);
            if (!isLikelyDefaultView) continue;
            node.parentId = nodeId;
            node.metadata = {
              ...node.metadata,
              runtime: node.metadata?.runtime ?? directive ?? "server",
              next: nextFile.type,
            };
            for (const [edgeIndex, edge] of edges.entries()) {
              if (
                edge.kind === "contains" &&
                edge.source === file.moduleId &&
                edge.target === node.id
              ) {
                edges[edgeIndex] = edgeFrom(
                  "contains",
                  nodeId,
                  node.id,
                  edge.evidence[0]!,
                );
              }
            }
          }
        }
      }
    }

    // Vue Router: createRouter({ routes }) → page atoms (path + component binding).
    const seenVuePagePaths = new Set<string>();
    for (const file of parsed) {
      const localDeclarations =
        declarationsByFile.get(file.relative) ?? new Map<string, string>();
      const importSpecByLocal = new Map<string, string>();
      for (const statement of file.source.statements) {
        if (!ts.isImportDeclaration(statement) || !statement.importClause) {
          continue;
        }
        const specifier = stringValue(statement.moduleSpecifier);
        if (!specifier) continue;
        const clause = statement.importClause;
        if (clause.name) importSpecByLocal.set(clause.name.text, specifier);
        const bindings = clause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            importSpecByLocal.set(element.name.text, specifier);
          }
        }
      }

      const visitRouter = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && isCreateRouterCall(node)) {
          const options = node.arguments[0];
          if (options && ts.isObjectLiteralExpression(options)) {
            const routesExpr = objectProperty(options, "routes");
            const routesArray = resolveArrayLiteral(routesExpr, file.source);
            if (routesArray) {
              for (const record of collectVueRouteRecords(routesArray.elements)) {
                if (seenVuePagePaths.has(record.path)) continue;
                seenVuePagePaths.add(record.path);
                const label =
                  record.path === "/"
                    ? "Home"
                    : record.name
                      ? record.name
                      : record.path;
                const pageId = stableId(
                  "page",
                  file.relative,
                  "vue-router",
                  record.path,
                );
                const componentSpecifier =
                  record.componentSpecifier ??
                  (record.componentName
                    ? importSpecByLocal.get(record.componentName)
                    : undefined);
                nodes.push({
                  id: pageId,
                  kind: "page",
                  label,
                  qualifiedName: `${file.relative}#vue-route:${record.path}`,
                  parentId: file.moduleId,
                  technology: "vue-router",
                  metadata: {
                    vue: "page",
                    path: record.path,
                    framework: "vue",
                    ...(record.name ? { routeName: record.name } : {}),
                    ...(record.componentName
                      ? { componentName: record.componentName }
                      : {}),
                    ...(componentSpecifier
                      ? { componentSpecifier }
                      : {}),
                  },
                  evidence: [
                    evidenceFor(
                      file,
                      record.at,
                      "observed",
                      `Vue Router page ${record.path}`,
                    ),
                  ],
                });
                edges.push(
                  edgeFrom(
                    "contains",
                    file.moduleId,
                    pageId,
                    evidenceFor(
                      file,
                      record.at,
                      "observed",
                      `Vue Router page ${record.path}`,
                    ),
                  ),
                );

                // Prefer binding the page atom to its view module when resolvable.
                if (componentSpecifier?.startsWith(".")) {
                  const targetModule = resolveRelativeImport(
                    file,
                    componentSpecifier,
                    moduleByAbsolute,
                  );
                  if (targetModule) {
                    edges.push(
                      edgeFrom(
                        "routes-to",
                        pageId,
                        targetModule,
                        evidenceFor(
                          file,
                          record.at,
                          "derived",
                          `Vue Router binds ${record.path} → ${componentSpecifier}`,
                        ),
                      ),
                    );
                  }
                } else if (record.componentName) {
                  const target = localDeclarations.get(record.componentName);
                  if (target) {
                    edges.push(
                      edgeFrom(
                        "routes-to",
                        pageId,
                        target,
                        evidenceFor(
                          file,
                          record.at,
                          "derived",
                          `Vue Router binds ${record.path} → ${record.componentName}`,
                        ),
                      ),
                    );
                  }
                }
              }
            }
          }
        }
        ts.forEachChild(node, visitRouter);
      };
      visitRouter(file.source);
    }

    // Next.js middleware — access-gate signal (matcher + login redirect).
    const middlewareProtectedPrefixes: string[] = [];
    for (const file of parsed) {
      const normalized = file.relative.replaceAll("\\", "/");
      if (!/(?:^|\/)middleware\.[cm]?[jt]sx?$/i.test(normalized)) continue;
      const matcherPaths: string[] = [];
      let redirectsToLogin = false;
      const visitMiddleware = (node: ts.Node): void => {
        if (
          ts.isPropertyAssignment(node) &&
          ((ts.isIdentifier(node.name) && node.name.text === "matcher") ||
            (ts.isStringLiteralLike(node.name) && node.name.text === "matcher"))
        ) {
          const collect = (expr: ts.Expression): void => {
            if (ts.isStringLiteralLike(expr)) {
              matcherPaths.push(expr.text);
            } else if (ts.isArrayLiteralExpression(expr)) {
              for (const element of expr.elements) collect(element);
            } else if (ts.isObjectLiteralExpression(expr)) {
              for (const property of expr.properties) {
                if (
                  ts.isPropertyAssignment(property) &&
                  ts.isIdentifier(property.name) &&
                  property.name.text === "source" &&
                  ts.isStringLiteralLike(property.initializer)
                ) {
                  matcherPaths.push(property.initializer.text);
                }
              }
            }
          };
          collect(node.initializer);
        }
        if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
          const text = node.getText(file.source);
          if (
            /redirect\s*\(/i.test(text) &&
            /['"`](\/login|\/signin|\/sign-in|\/auth)/i.test(text)
          ) {
            redirectsToLogin = true;
          }
        }
        if (ts.isStringLiteralLike(node)) {
          if (/^\/(login|signin|sign-in|auth)\b/i.test(node.text)) {
            // Presence of login path in middleware often accompanies guards.
            if (/NextResponse\.redirect|redirect\(/i.test(file.source.text)) {
              redirectsToLogin = true;
            }
          }
        }
        ts.forEachChild(node, visitMiddleware);
      };
      visitMiddleware(file.source);
      const protectedPrefixes = protectedPrefixesFromMiddleware(
        file.source.text,
        matcherPaths,
      );
      for (const prefix of protectedPrefixes) {
        if (!middlewareProtectedPrefixes.includes(prefix)) {
          middlewareProtectedPrefixes.push(prefix);
        }
      }
      const middlewareId = stableId("config", file.relative, "middleware");
      nodes.push({
        id: middlewareId,
        kind: "config",
        label: "Next.js middleware",
        qualifiedName: file.relative,
        parentId: file.moduleId,
        technology: "next-middleware",
        metadata: {
          next: "middleware",
          framework: "next",
          surface: "story",
          ...(matcherPaths.length ? { middlewareMatchers: matcherPaths } : {}),
          ...(protectedPrefixes.length
            ? { middlewareProtectedPrefixes: [...protectedPrefixes] }
            : {}),
          ...(redirectsToLogin ? { redirectsToLogin: true } : {}),
          ...(matcherPaths.length ||
          redirectsToLogin ||
          protectedPrefixes.length
            ? { accessSignal: "middleware-gate" }
            : {}),
        },
        evidence: [
          evidenceFor(
            file,
            file.source,
            "observed",
            protectedPrefixes.length
              ? `Next.js middleware protected prefixes: ${protectedPrefixes.join(", ")}`
              : matcherPaths.length
                ? `Next.js middleware matcher: ${matcherPaths.join(", ")}`
                : "Next.js middleware",
          ),
        ],
      });
      edges.push(
        edgeFrom(
          "contains",
          file.moduleId,
          middlewareId,
          evidenceFor(file, file.source, "observed", "Next.js middleware"),
        ),
      );
    }

    // Pass A honesty: middleware path prefixes mark matching pages protected.
    // Never override stronger route-group auth/public; never invent from URL alone.
    if (middlewareProtectedPrefixes.length) {
      for (const node of nodes) {
        if (node.kind !== "page") continue;
        const pagePath =
          typeof node.metadata?.path === "string" ? node.metadata.path : "";
        if (!pagePath) continue;
        const matched = middlewareProtectedPrefixes.find((prefix) =>
          pathMatchesProtectedPrefix(pagePath, prefix),
        );
        if (!matched) continue;
        const current = node.metadata?.access;
        if (current === "auth" || current === "public" || current === "protected") {
          continue;
        }
        node.metadata = {
          ...node.metadata,
          access: "protected",
          shell: "protected",
          surface: "story",
          reachability: "route-tree",
          accessSignal: "middleware-prefix",
        };
        node.evidence = [
          ...node.evidence,
          {
            file:
              typeof node.qualifiedName === "string"
                ? node.qualifiedName.split("#")[0] ?? "."
                : ".",
            extractor: "typescript",
            certainty: "derived",
            detail: `Middleware protects ${matched} → access=protected`,
          },
        ];
      }
    }

    return {
      extractor: { id: this.id, version: this.version },
      nodes,
      edges,
      diagnostics: [],
    };
  },
};
