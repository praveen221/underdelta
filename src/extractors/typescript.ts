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
}

/** Parse Next.js App Router special files under `app/` or `src/app/`. */
function parseNextAppFile(relative: string): NextAppFile | undefined {
  const file = relative.replaceAll("\\", "/");
  const match = file.match(
    /(?:^|\/)(?:src\/)?app\/(?:(.+)\/)?(page|layout|route|loading|error|template|default)\.[cm]?[jt]sx?$/i,
  );
  if (!match) return undefined;
  const rawSegments = (match[1] ?? "").split("/").filter(Boolean);
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
  };
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

          if (method === "schedule" || method === "cron") {
            const expression = stringValue(node.arguments[0]);
            if (expression) {
              const handler = node.arguments[1];
              const handlerName =
                handler && ts.isIdentifier(handler) ? handler.text : undefined;
              const cronId = stableId("cron", file.relative, expression);
              const cronMetadata: Record<string, unknown> = { expression };
              if (handlerName !== undefined) cronMetadata.handler = handlerName;
              nodes.push({
                id: cronId,
                kind: "cron",
                label: handlerName
                  ? `${handlerName} (${expression})`
                  : expression,
                parentId: file.moduleId,
                technology: receiver ?? "scheduler",
                metadata: cronMetadata,
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

    return {
      extractor: { id: this.id, version: this.version },
      nodes,
      edges,
      diagnostics: [],
    };
  },
};
