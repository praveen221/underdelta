import { readFile } from "node:fs/promises";
import type { SemanticAdapter } from "../../adapter.js";
import { edgeFrom, relativeFile, stableId } from "../../graph.js";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  Evidence,
  SemanticFacet,
} from "../../schema.js";

type EndpointFacet = Extract<SemanticFacet, { kind: "endpoint" }>;

interface FlaskFile {
  file: string;
  source: string;
  imports: Map<string, FlaskImport>;
  ownPrefixes: Map<string, string>;
}

interface FlaskImport {
  module: string;
  imported: string;
}

interface FlaskDefinition {
  key: string;
  file: string;
  symbol: string;
  prefix: string;
}

function unquote(value: string): string {
  return value.slice(1, -1);
}

function normalizePath(value: string): string {
  const withSlash = value.startsWith("/") ? value : `/${value}`;
  const compact = withSlash.replace(/\/{2,}/g, "/");
  return compact.length > 1 && compact.endsWith("/")
    ? compact.slice(0, -1)
    : compact;
}

function joinPaths(prefix: string, routePath: string): string {
  if (!prefix || prefix === "/") return normalizePath(routePath);
  if (!routePath || routePath === "/") return normalizePath(prefix);
  return normalizePath(`${prefix}/${routePath}`);
}

function stringOption(source: string, key: string): string | undefined {
  const match = new RegExp(`\\b${key}\\s*=\\s*(["'][^"']*["'])`).exec(source);
  return match?.[1] ? unquote(match[1]) : undefined;
}

function methodsOption(source: string): string[] {
  const body = /\bmethods\s*=\s*\[([^\]]+)\]/i.exec(source)?.[1];
  if (!body) return [];
  return [...body.matchAll(/["']([A-Za-z]+)["']/g)]
    .map((match) => match[1]!.toUpperCase());
}

function definitionKey(file: string, symbol: string): string {
  return `${file}:${symbol}`;
}

function pythonModulePath(file: string): string {
  if (file === "__init__.py") return "";
  if (file.endsWith("/__init__.py")) return file.slice(0, -"/__init__.py".length);
  return file.replace(/\.py$/i, "");
}

function importedModulePath(file: string, importedModule: string): string {
  const relative = /^(\.*)(.*)$/.exec(importedModule);
  const dots = relative?.[1]?.length ?? 0;
  const remainder = relative?.[2] ?? importedModule;
  if (!dots) return remainder.replace(/\./g, "/");

  const currentModule = pythonModulePath(file);
  const packageParts = (file.endsWith("/__init__.py") || file === "__init__.py"
    ? currentModule
    : currentModule.split("/").slice(0, -1).join("/"))
    .split("/")
    .filter(Boolean);
  packageParts.splice(Math.max(0, packageParts.length - (dots - 1)));
  if (remainder) packageParts.push(...remainder.split(".").filter(Boolean));
  return packageParts.join("/");
}

function resolveDefinition(
  model: FlaskFile,
  local: string,
  definitions: ReadonlyMap<string, FlaskDefinition>,
): FlaskDefinition | undefined {
  const localDefinition = definitions.get(definitionKey(model.file, local));
  if (localDefinition) return localDefinition;

  const imported = model.imports.get(local);
  if (!imported) return undefined;
  const candidates = [...definitions.values()].filter(
    (definition) => definition.symbol === imported.imported,
  );
  const expectedModule = importedModulePath(model.file, imported.module);
  const moduleCandidates = candidates.filter(
    (definition) => pythonModulePath(definition.file) === expectedModule,
  );
  if (moduleCandidates.length === 1) return moduleCandidates[0];
  return candidates.length === 1 ? candidates[0] : undefined;
}

function parseFile(file: string, source: string): FlaskFile {
  const imports = new Map<string, FlaskImport>();
  for (const match of source.matchAll(
    /^[ \t]*from[ \t]+([.\w]+)[ \t]+import[ \t]+([A-Za-z_]\w*)(?:[ \t]+as[ \t]+([A-Za-z_]\w*))?/gm,
  )) {
    const module = match[1];
    const imported = match[2];
    const local = match[3] ?? imported;
    if (module && imported && local) imports.set(local, { module, imported });
  }

  const ownPrefixes = new Map<string, string>();
  for (const match of source.matchAll(
    /^[ \t]*([A-Za-z_]\w*)[ \t]*=[ \t]*(Blueprint|Flask)[ \t]*\(([\s\S]*?)\)[ \t]*$/gm,
  )) {
    const receiver = match[1];
    if (!receiver) continue;
    ownPrefixes.set(receiver, stringOption(match[3] ?? "", "url_prefix") ?? "");
  }
  return { file, source, imports, ownPrefixes };
}

function registrationPrefixes(
  models: readonly FlaskFile[],
  definitions: ReadonlyMap<string, FlaskDefinition>,
): Map<string, Set<string>> {
  const prefixes = new Map<string, Set<string>>();
  const add = (key: string, prefix: string): void => {
    const values = prefixes.get(key) ?? new Set<string>();
    values.add(prefix);
    prefixes.set(key, values);
  };

  for (const model of models) {
    for (const match of model.source.matchAll(
      /^[ \t]*[A-Za-z_]\w*\.register_blueprint[ \t]*\([ \t]*([A-Za-z_]\w*)([\s\S]*?)\)[ \t]*$/gm,
    )) {
      const local = match[1];
      if (!local) continue;
      const definition = resolveDefinition(model, local, definitions);
      if (!definition) continue;
      add(definition.key, stringOption(match[2] ?? "", "url_prefix") ?? "");
    }
  }
  return prefixes;
}

function effectivePrefixes(
  definition: FlaskDefinition,
  registered: ReadonlyMap<string, Set<string>>,
): string[] {
  const own = definition.prefix;
  const mountPrefixes = registered.get(definition.key);
  if (!mountPrefixes?.size) return [own];
  return [...mountPrefixes].map((mount) =>
    own ? joinPaths(mount, own) : mount
  );
}

function evidenceAt(
  adapter: string,
  file: string,
  source: string,
  offset: number,
  detail: string,
): Evidence {
  const line = source.slice(0, offset).split(/\r?\n/).length;
  return {
    file,
    range: {
      startLine: line,
      startColumn: 0,
      endLine: line,
      endColumn: 0,
    },
    extractor: adapter,
    certainty: "observed",
    detail,
  };
}

function handlerId(
  baseNodes: readonly ArchitectureNode[],
  file: string,
  handler: string | undefined,
): string | undefined {
  if (!handler) return undefined;
  const sameFile = baseNodes.filter(
    (node) =>
      node.kind === "function" &&
      node.label === handler &&
      node.evidence.some((item) => item.file === file),
  );
  if (sameFile.length === 1) return sameFile[0]!.id;
  const global = baseNodes.filter(
    (node) => node.kind === "function" && node.label === handler,
  );
  return global.length === 1 ? global[0]!.id : undefined;
}

function methodViewMethods(source: string, className: string): string[] {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = new RegExp(`^class\\s+${escaped}\\s*\\([^)]*MethodView[^)]*\\)\\s*:`, "m")
    .exec(source);
  if (!start || start.index === undefined) return [];
  const body = source.slice(start.index + start[0].length);
  const end = /^(?:class|def|async\s+def)\s+/m.exec(body)?.index ?? body.length;
  return [...body.slice(0, end).matchAll(/^\s+(?:async\s+)?def\s+(get|post|put|patch|delete|head|options)\s*\(/gmi)]
    .map((match) => match[1]!.toUpperCase());
}

function addEndpoint(
  nodes: ArchitectureNode[],
  edges: ArchitectureEdge[],
  args: {
    baseNodes: readonly ArchitectureNode[];
    file: string;
    moduleId: string;
    method: string;
    path: string;
    handler?: string;
    evidence: Evidence;
  },
): void {
  const method = args.method.toUpperCase();
  const routeId = stableId("route", "flask", args.file, method, args.path);
  const endpoint: EndpointFacet = {
    kind: "endpoint",
    protocol: "http",
    method,
    path: args.path,
    provider: "flask",
    declaration: "code",
  };
  nodes.push({
    id: routeId,
    kind: "route",
    label: `${method} ${args.path}`,
    parentId: args.moduleId,
    technology: "flask",
    semantics: [endpoint],
    metadata: { method, path: args.path, framework: "flask" },
    evidence: [args.evidence],
  });
  edges.push(edgeFrom("contains", args.moduleId, routeId, args.evidence));
  const target = handlerId(args.baseNodes, args.file, args.handler);
  if (target) edges.push(edgeFrom("routes-to", routeId, target, args.evidence));
}

export const flaskHttpAdapter: SemanticAdapter = {
  id: "http-flask",
  version: "0.2.0",
  capability: "http-api",
  extensions: new Set([".py"]),

  async extract(context) {
    const models: FlaskFile[] = [];
    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      const source = await readFile(absolute, "utf8");
      models.push(parseFile(file, source));
    }
    const definitions = new Map<string, FlaskDefinition>();
    for (const model of models) {
      for (const [receiver, prefix] of model.ownPrefixes) {
        const key = definitionKey(model.file, receiver);
        definitions.set(key, { key, file: model.file, symbol: receiver, prefix });
      }
    }
    const registered = registrationPrefixes(models, definitions);
    const nodes: ArchitectureNode[] = [];
    const edges: ArchitectureEdge[] = [];

    for (const model of models) {
      const moduleId = context.nodes.find(
        (node) => node.kind === "module" && node.label === model.file,
      )?.id ?? stableId("module", model.file);

      for (const match of model.source.matchAll(
        /^[ \t]*@([A-Za-z_]\w*)\.(route|get|post|put|patch|delete|head|options)[ \t]*\([ \t]*(["'][^"']*["'])([\s\S]*?)\)[ \t]*\r?\n[ \t]*(?:async[ \t]+)?def[ \t]+([A-Za-z_]\w*)[ \t]*\(/gm,
      )) {
        const receiver = match[1];
        const declaration = match[2]?.toLowerCase();
        const rawPath = match[3];
        const handler = match[5];
        if (!receiver || !declaration || !rawPath || match.index === undefined) continue;
        const definition = resolveDefinition(model, receiver, definitions);
        if (!definition) continue;
        const methods = declaration === "route"
          ? methodsOption(match[4] ?? "")
          : [declaration.toUpperCase()];
        const effectiveMethods = methods.length ? methods : ["GET"];
        for (const prefix of effectivePrefixes(definition, registered)) {
          const fullPath = joinPaths(prefix, unquote(rawPath));
          for (const method of effectiveMethods) {
            addEndpoint(nodes, edges, {
              baseNodes: context.nodes,
              file: model.file,
              moduleId,
              method,
              path: fullPath,
              ...(handler ? { handler } : {}),
              evidence: evidenceAt(
                this.id,
                model.file,
                model.source,
                match.index,
                `Flask @${receiver}.${declaration} ${method} ${fullPath}`,
              ),
            });
          }
        }
      }

      for (const match of model.source.matchAll(
        /^[ \t]*([A-Za-z_]\w*)\.add_url_rule[ \t]*\([ \t]*(["'][^"']*["'])([\s\S]*?)\)[ \t]*$/gm,
      )) {
        const receiver = match[1];
        const rawPath = match[2];
        const options = match[3] ?? "";
        if (!receiver || !rawPath || match.index === undefined) continue;
        const definition = resolveDefinition(model, receiver, definitions);
        if (!definition) continue;
        const functionHandler = /\bview_func\s*=\s*([A-Za-z_]\w*)\b/.exec(options)?.[1];
        const methodView = /\bview_func\s*=\s*([A-Za-z_]\w*)\.as_view\s*\(/.exec(options)?.[1];
        const methods = methodsOption(options);
        const effectiveMethods = methods.length
          ? methods
          : methodView
            ? methodViewMethods(model.source, methodView)
            : ["GET"];
        for (const prefix of effectivePrefixes(definition, registered)) {
          const fullPath = joinPaths(prefix, unquote(rawPath));
          for (const method of effectiveMethods.length ? effectiveMethods : ["GET"]) {
            addEndpoint(nodes, edges, {
              baseNodes: context.nodes,
              file: model.file,
              moduleId,
              method,
              path: fullPath,
              ...(functionHandler && !methodView ? { handler: functionHandler } : {}),
              evidence: evidenceAt(
                this.id,
                model.file,
                model.source,
                match.index,
                `Flask ${receiver}.add_url_rule ${method} ${fullPath}`,
              ),
            });
          }
        }
      }
    }

    return {
      adapter: { id: this.id, version: this.version, capability: this.capability },
      nodes,
      edges,
      diagnostics: [],
    };
  },
};
