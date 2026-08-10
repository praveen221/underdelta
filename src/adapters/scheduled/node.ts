import { readFile } from "node:fs/promises";
import { ts } from "ts-morph";
import type { SemanticAdapter } from "../../adapter.js";
import { relativeFile } from "../../graph.js";
import type { ArchitectureEdge, ArchitectureNode } from "../../schema.js";
import {
  addScheduledWork,
  evidenceAt,
  functionIdFor,
} from "./common.js";

const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"]);
const supportedPackages = new Set(["node-cron", "cron", "@nestjs/schedule"]);

function stringValue(node: ts.Expression | undefined): string | undefined {
  return node &&
    (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;
}

function propertyChain(node: ts.Expression): string[] {
  if (ts.isIdentifier(node)) return [node.text];
  if (ts.isPropertyAccessExpression(node)) {
    return [...propertyChain(node.expression), node.name.text];
  }
  return [];
}

function objectString(
  node: ts.Expression | undefined,
  key: string,
): string | undefined {
  if (!node || !ts.isObjectLiteralExpression(node)) return undefined;
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = property.name.getText().replace(/^['"]|['"]$/g, "");
    if (name === key) return stringValue(property.initializer);
  }
  return undefined;
}

function handlerName(
  node: ts.Expression | undefined,
  baseNodes: readonly ArchitectureNode[],
  file: string,
): string | undefined {
  if (!node) return undefined;
  if (ts.isIdentifier(node)) return node.text;
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) {
    return undefined;
  }
  const localCalls = new Set<string>();
  const visit = (child: ts.Node): void => {
    if (
      ts.isCallExpression(child) &&
      ts.isIdentifier(child.expression) &&
      functionIdFor(baseNodes, file, child.expression.text)
    ) {
      localCalls.add(child.expression.text);
    }
    ts.forEachChild(child, visit);
  };
  visit(node.body);
  return localCalls.size === 1 ? [...localCalls][0] : undefined;
}

export const nodeScheduledWorkAdapter: SemanticAdapter = {
  id: "scheduled-node",
  version: "0.2.0",
  capability: "scheduled-work",
  extensions,

  async extract(context) {
    const nodes: ArchitectureNode[] = [];
    const edges: ArchitectureEdge[] = [];

    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      const sourceText = await readFile(absolute, "utf8");
      const source = ts.createSourceFile(
        absolute,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        absolute.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const imports = new Map<string, string>();
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) ||
          !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const pkg = statement.moduleSpecifier.text;
        if (!supportedPackages.has(pkg)) continue;
        const clause = statement.importClause;
        if (clause?.name) imports.set(clause.name.text, pkg);
        const bindings = clause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) {
          imports.set(bindings.name.text, pkg);
        } else if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            imports.set(element.name.text, pkg);
          }
        }
      }

      const add = (
        at: ts.Node,
        provider: string,
        expression: string,
        handler: string | undefined,
        timezone?: string,
      ): void => {
        const name = handler ?? `${provider} scheduled work`;
        addScheduledWork(nodes, edges, {
          baseNodes: context.nodes,
          file,
          provider,
          name,
          expression,
          ...(timezone ? { timezone } : {}),
          triggerKind: "cron",
          declaration: "code",
          executionKind: "in-process",
          ...(handler ? { handler } : {}),
          ...(handler && functionIdFor(context.nodes, file, handler)
            ? { handlerId: functionIdFor(context.nodes, file, handler)! }
            : {}),
          evidence: evidenceAt(
            this.id,
            file,
            sourceText,
            at.getStart(source),
            `${provider} schedule ${expression}`,
          ),
        });
      };

      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
          const chain = propertyChain(node.expression);
          const receiver = chain.at(-2);
          const method = chain.at(-1);
          const direct = chain.length === 1 ? chain[0] : undefined;
          const provider = receiver
            ? imports.get(receiver)
            : direct
              ? imports.get(direct)
              : undefined;
          if (
            provider &&
            ((provider === "node-cron" && method === "schedule") ||
              (provider === "node-cron" && direct === "schedule"))
          ) {
            const expression = stringValue(node.arguments[0]);
            const handler = handlerName(
              node.arguments[1],
              context.nodes,
              file,
            );
            if (expression) {
              add(
                node,
                provider,
                expression,
                handler,
                objectString(node.arguments[2], "timezone"),
              );
            }
          }
        }

        if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
          const provider = imports.get(node.expression.text);
          if (provider === "cron" && node.expression.text === "CronJob") {
            const expression = stringValue(node.arguments?.[0]);
            const handler = handlerName(
              node.arguments?.[1],
              context.nodes,
              file,
            );
            if (expression) add(node, provider, expression, handler);
          }
        }

        if (ts.isMethodDeclaration(node) && node.name) {
          const decorators = ts.canHaveDecorators(node)
            ? ts.getDecorators(node) ?? []
            : [];
          for (const decorator of decorators) {
            if (!ts.isCallExpression(decorator.expression)) continue;
            const call = decorator.expression;
            if (!ts.isIdentifier(call.expression)) continue;
            if (imports.get(call.expression.text) !== "@nestjs/schedule") continue;
            if (call.expression.text !== "Cron") continue;
            const expression = stringValue(call.arguments[0]);
            if (!expression) continue;
            add(
              decorator,
              "@nestjs/schedule",
              expression,
              node.name.getText(source),
              objectString(call.arguments[1], "timeZone"),
            );
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
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
