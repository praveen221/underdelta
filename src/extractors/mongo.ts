import { readFile } from "node:fs/promises";
import { edgeFrom, relativeFile, stableId } from "../graph.js";
import type { ArchitectureExtractor } from "../extractor.js";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  Evidence,
} from "../schema.js";

const extensions = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
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
    extractor: "mongo",
    certainty: "observed",
  };
  if (detail) item.detail = detail;
  return item;
}

function cleanName(raw: string): string {
  return raw.trim().replaceAll(/["'`]/g, "");
}

/** Prefer product model words (Note) over raw collection plurals (notes). */
function looksLikeModelName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

/**
 * Map simple same-file string bindings used as `.collection(CONST)` args.
 * Covers hackathon-starter style:
 *   const RAG_CHUNKS = 'rag_chunks';
 *   db.collection(RAG_CHUNKS)
 */
function collectStringBindings(source: string): Map<string, string> {
  const bindings = new Map<string, string>();
  const pattern =
    /(?:^|[;\n])\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])([^'"\n]+)\2/gm;
  for (const match of source.matchAll(pattern)) {
    const name = match[1] ?? "";
    const value = cleanName(match[3] ?? "");
    if (!name || !value) continue;
    bindings.set(name, value);
  }
  return bindings;
}

const STAGE_LABELS: Record<string, string> = {
  match: "Filter",
  group: "Group",
  sort: "Sort",
  limit: "Limit",
  skip: "Skip",
  project: "Shape",
  lookup: "Join",
  unwind: "Unwind",
  addFields: "Enrich",
  set: "Set",
  unset: "Unset",
  facet: "Facet",
  count: "Count",
  search: "Search",
  vectorSearch: "Vector search",
  replaceRoot: "Reshape",
  out: "Write",
  merge: "Merge",
};

function humanizeStage(operator: string): string {
  return STAGE_LABELS[operator] ?? operator;
}

/**
 * Replace line and block comments with spaces (newlines kept) so regex scans
 * do not treat prose like `collection.aggregate (` in JSDoc as call sites.
 */
function maskComments(source: string): string {
  let out = "";
  let i = 0;
  let quote: string | undefined;
  let escaped = false;
  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = undefined;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      out += "  ";
      i += 2;
      while (i < source.length && source[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
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
        i += 1;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Read `$stage` operators from an `.aggregate(...)` argument list starting at `(`.
 * Supports array pipelines and legacy single-object stages.
 */
function readAggregateStages(
  source: string,
  openParenIndex: number,
): string[] {
  let i = openParenIndex + 1;
  while (i < source.length && /\s/.test(source[i]!)) i += 1;
  if (i >= source.length) return [];

  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let quote: string | undefined;
  let escaped = false;
  const start = i;
  for (; i < source.length; i += 1) {
    const ch = source[i]!;
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") depthParen += 1;
    else if (ch === ")") {
      if (depthParen === 0 && depthBracket === 0 && depthBrace === 0) break;
      depthParen -= 1;
    } else if (ch === "[") depthBracket += 1;
    else if (ch === "]") depthBracket = Math.max(0, depthBracket - 1);
    else if (ch === "{") depthBrace += 1;
    else if (ch === "}") depthBrace = Math.max(0, depthBrace - 1);
  }

  const body = source.slice(start, i);
  const stages: string[] = [];
  const seen = new Set<string>();
  // Only known pipeline stage operators — skip accumulators ($sum) and
  // field paths ($votes) that also use $-prefix syntax.
  for (const match of body.matchAll(/\$([A-Za-z][A-Za-z0-9]*)/g)) {
    const op = match[1] ?? "";
    if (!op || seen.has(op) || !(op in STAGE_LABELS)) continue;
    const at = match.index ?? -1;
    if (at < 0) continue;
    const before = body.slice(Math.max(0, at - 12), at);
    // Stage ops appear as object keys: `{ $match:` / `, $group:`.
    if (!/[{,]\s*$/.test(before)) continue;
    seen.add(op);
    stages.push(op);
  }
  return stages;
}

export const mongoExtractor: ArchitectureExtractor = {
  id: "mongo",
  version: "0.1.2",
  extensions,

  async extract(context) {
    const nodes: ArchitectureNode[] = [];
    const edges: ArchitectureEdge[] = [];
    const seen = new Set<string>();

    function ensureDatabase(
      file: string,
      source: string,
      offset: number,
      technology: "mongoose" | "mongodb",
    ): string {
      const databaseId = stableId("database", technology, "default");
      if (!seen.has(databaseId)) {
        seen.add(databaseId);
        nodes.push({
          id: databaseId,
          kind: "database",
          label: "MongoDB",
          technology,
          metadata: {},
          evidence: [
            evidence(file, source, offset, `${technology} database`),
          ],
        });
      }
      return databaseId;
    }

    function ensureCollection(
      file: string,
      source: string,
      offset: number,
      label: string,
      technology: "mongoose" | "mongodb",
      extras: {
        collectionName?: string;
        bindingName?: string;
        discoveredFromUsage?: boolean;
        detail?: string;
      } = {},
    ): string {
      const key = label.toLowerCase();
      const collectionId = stableId("collection", technology, key);
      if (seen.has(collectionId)) {
        const existing = nodes.find((node) => node.id === collectionId);
        if (existing) {
          const next = { ...existing.metadata };
          if (extras.collectionName && !next.collectionName) {
            next.collectionName = extras.collectionName;
          }
          if (extras.bindingName && !next.bindingName) {
            next.bindingName = extras.bindingName;
          }
          existing.metadata = next;
        }
        return collectionId;
      }
      seen.add(collectionId);
      const databaseId = ensureDatabase(file, source, offset, technology);
      const metadata: Record<string, unknown> = {};
      if (extras.collectionName) metadata.collectionName = extras.collectionName;
      if (extras.bindingName) metadata.bindingName = extras.bindingName;
      if (extras.discoveredFromUsage) metadata.discoveredFromUsage = true;
      nodes.push({
        id: collectionId,
        kind: "collection",
        label,
        parentId: databaseId,
        technology,
        metadata,
        evidence: [evidence(file, source, offset, extras.detail)],
      });
      edges.push(
        edgeFrom(
          "contains",
          databaseId,
          collectionId,
          evidence(file, source, offset),
        ),
      );
      return collectionId;
    }

    function ensureAggregatePipeline(
      file: string,
      source: string,
      offset: number,
      technology: "mongoose" | "mongodb",
      collectionLabel: string,
      extras: {
        collectionName?: string;
        bindingName?: string;
        modelName?: string;
        stages: string[];
        detail?: string;
      },
    ): string {
      const keyParts = [
        technology,
        (extras.collectionName ?? extras.modelName ?? collectionLabel).toLowerCase(),
        extras.stages.join("|") || "aggregate",
      ];
      const pipelineId = stableId("pipeline", "mongo", ...keyParts);
      if (seen.has(pipelineId)) return pipelineId;
      seen.add(pipelineId);

      const metadata: Record<string, unknown> = {
        mongoAggregate: true,
        stages: extras.stages,
      };
      if (extras.collectionName) metadata.collectionName = extras.collectionName;
      if (extras.bindingName) metadata.bindingName = extras.bindingName;
      if (extras.modelName) metadata.modelName = extras.modelName;

      nodes.push({
        id: pipelineId,
        kind: "pipeline",
        label: `${collectionLabel} pipeline`,
        technology,
        metadata,
        evidence: [
          evidence(
            file,
            source,
            offset,
            extras.detail ?? `.aggregate(${extras.stages.map((s) => `$${s}`).join(", ")})`,
          ),
        ],
      });

      let previousStepId: string | undefined;
      for (const stage of extras.stages) {
        const stepId = stableId("pipeline-step", pipelineId, stage);
        if (!seen.has(stepId)) {
          seen.add(stepId);
          nodes.push({
            id: stepId,
            kind: "pipeline-step",
            label: humanizeStage(stage),
            parentId: pipelineId,
            technology,
            metadata: {
              pipeline: pipelineId,
              mongoStage: stage,
            },
            evidence: [
              evidence(file, source, offset, `$${stage}`),
            ],
          });
          edges.push(
            edgeFrom(
              "contains",
              pipelineId,
              stepId,
              evidence(file, source, offset),
            ),
          );
        }
        if (previousStepId) {
          edges.push(
            edgeFrom(
              "flows-to",
              previousStepId,
              stepId,
              evidence(file, source, offset),
            ),
          );
        }
        previousStepId = stepId;
      }

      return pipelineId;
    }

    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      const source = await readFile(absolute, "utf8");
      const code = maskComments(source);
      const mentionsMongoose =
        /\bmongoose\b/.test(code) ||
        /from\s+['"]mongoose['"]/.test(code) ||
        /require\s*\(\s*['"]mongoose['"]\s*\)/.test(code);
      const mentionsMongoDriver =
        /\bmongodb\b/.test(code) ||
        /MongoClient/.test(code) ||
        /\.collection\s*\(/.test(code);

      if (!mentionsMongoose && !mentionsMongoDriver) continue;

      // Scan masked code so JSDoc/prose cannot invent call sites; evidence
      // still points at the original source (offsets preserved by maskComments).
      // mongoose.model("Note", schema) — primary Mongoose declaration.
      const modelPattern =
        /\bmongoose\.model(?:\s*<[^>]*>)?\s*\(\s*(['"])([^'"\n]+)\1/g;
      for (const match of code.matchAll(modelPattern)) {
        const name = cleanName(match[2] ?? "");
        if (!name || match.index === undefined) continue;
        ensureCollection(file, source, match.index, name, "mongoose", {
          ...(looksLikeModelName(name) ? {} : { collectionName: name }),
          detail: `mongoose.model(${JSON.stringify(name)})`,
        });
      }

      // import { model } from "mongoose"; model("Note", schema)
      if (mentionsMongoose) {
        const bareModelPattern =
          /(?:^|[^\w.])model(?:\s*<[^>]*>)?\s*\(\s*(['"])([^'"\n]+)\1/gm;
        for (const match of code.matchAll(bareModelPattern)) {
          const name = cleanName(match[2] ?? "");
          if (!name || match.index === undefined) continue;
          // Skip if this was already captured as mongoose.model(...)
          const around = code.slice(
            Math.max(0, match.index - 12),
            match.index + 8,
          );
          if (
            /\bmongoose\s*\.\s*$/.test(around) ||
            around.includes("mongoose.model")
          ) {
            continue;
          }
          ensureCollection(file, source, match.index, name, "mongoose", {
            detail: `model(${JSON.stringify(name)})`,
          });
        }
      }

      // new Schema(..., { collection: "notes" }) — emit the raw collection
      // name; mongoose.model("Note", ...) supplies the product label and
      // projection merges Note ↔ notes by normalize key. Do NOT guess a model
      // name from a nearby call (multi-schema files mis-attribute Tag→Note).
      if (mentionsMongoose) {
        const schemaCollectionPattern =
          /\b(?:mongoose\.)?Schema\s*\(\s*\{[\s\S]{0,800}?\}\s*,\s*\{[\s\S]{0,200}?collection\s*:\s*(['"])([^'"\n]+)\1/g;
        for (const match of code.matchAll(schemaCollectionPattern)) {
          const collectionName = cleanName(match[2] ?? "");
          if (!collectionName || match.index === undefined) continue;
          ensureCollection(
            file,
            source,
            match.index,
            collectionName,
            "mongoose",
            {
              collectionName,
              detail: `Schema collection ${JSON.stringify(collectionName)}`,
            },
          );
        }
      }

      // Native driver: db.collection("notes") / db.collection(RAG_CHUNKS)
      // when RAG_CHUNKS = 'rag_chunks' is a same-file string binding.
      const stringBindings = collectStringBindings(code);
      const nativeCollectionPattern =
        /\.collection\s*\(\s*(?:(['"])([^'"\n]+)\1|([A-Za-z_$][\w$]*))/g;
      for (const match of code.matchAll(nativeCollectionPattern)) {
        if (match.index === undefined) continue;
        const literal = cleanName(match[2] ?? "");
        const identifier = match[3] ?? "";
        let collectionName = literal;
        let bindingName: string | undefined;
        if (!collectionName && identifier) {
          const resolved = stringBindings.get(identifier);
          if (!resolved) continue;
          collectionName = resolved;
          bindingName = identifier;
        }
        if (!collectionName) continue;
        ensureCollection(
          file,
          source,
          match.index,
          collectionName,
          mentionsMongoose ? "mongoose" : "mongodb",
          {
            collectionName,
            ...(bindingName ? { bindingName } : {}),
            discoveredFromUsage: true,
            detail: bindingName
              ? `.collection(${bindingName} → ${JSON.stringify(collectionName)})`
              : `.collection(${JSON.stringify(collectionName)})`,
          },
        );
      }

      // Aggregation pipelines: Model.aggregate([...]) and
      // db.collection(X).aggregate([...]) → pipeline + stage steps.
      const technology: "mongoose" | "mongodb" = mentionsMongoose
        ? "mongoose"
        : "mongodb";

      // Chained native: .collection(...).aggregate(
      const chainedAggregatePattern =
        /\.collection\s*\(\s*(?:(['"])([^'"\n]+)\1|([A-Za-z_$][\w$]*))\s*\)\s*\.\s*aggregate\s*\(/g;
      for (const match of code.matchAll(chainedAggregatePattern)) {
        if (match.index === undefined) continue;
        const literal = cleanName(match[2] ?? "");
        const identifier = match[3] ?? "";
        let collectionName = literal;
        let bindingName: string | undefined;
        if (!collectionName && identifier) {
          const resolved = stringBindings.get(identifier);
          if (!resolved) continue;
          collectionName = resolved;
          bindingName = identifier;
        }
        if (!collectionName) continue;
        const openParen = match.index + match[0].length - 1;
        const stages = readAggregateStages(code, openParen);
        const collectionId = ensureCollection(
          file,
          source,
          match.index,
          collectionName,
          technology,
          {
            collectionName,
            ...(bindingName ? { bindingName } : {}),
            discoveredFromUsage: true,
          },
        );
        const pipelineId = ensureAggregatePipeline(
          file,
          source,
          match.index,
          technology,
          bindingName ?? collectionName,
          {
            collectionName,
            ...(bindingName ? { bindingName } : {}),
            stages,
            detail: bindingName
              ? `.collection(${bindingName}).aggregate`
              : `.collection(${JSON.stringify(collectionName)}).aggregate`,
          },
        );
        edges.push(
          edgeFrom(
            "uses",
            pipelineId,
            collectionId,
            evidence(file, source, match.index, "aggregates"),
            "query",
          ),
        );
      }

      // Receiver.aggregate( — mongoose models + collection handles.
      // Skip prisma.*.aggregate and already-handled .collection().aggregate.
      const receiverAggregatePattern =
        /([A-Za-z_$][\w$]*)\s*\.\s*aggregate\s*\(/g;
      for (const match of code.matchAll(receiverAggregatePattern)) {
        if (match.index === undefined) continue;
        const receiver = match[1] ?? "";
        if (!receiver) continue;
        const before = code.slice(Math.max(0, match.index - 24), match.index);
        if (/\bprisma\s*\.\s*$/i.test(before)) continue;
        const windowStart = Math.max(0, match.index - 80);
        const window = code.slice(windowStart, match.index + match[0].length);
        if (/\.collection\s*\([^)]*\)\s*\.\s*aggregate\s*\($/.test(window)) {
          continue;
        }

        const openParen = match.index + match[0].length - 1;
        const stages = readAggregateStages(code, openParen);
        const bound = stringBindings.get(receiver);
        const collectionLabel = bound ?? receiver;
        const collectionId = ensureCollection(
          file,
          source,
          match.index,
          collectionLabel,
          technology,
          {
            ...(bound
              ? { collectionName: bound, bindingName: receiver }
              : looksLikeModelName(receiver)
                ? {}
                : { collectionName: receiver }),
            ...(looksLikeModelName(receiver)
              ? {}
              : { discoveredFromUsage: true }),
            detail: `${receiver}.aggregate`,
          },
        );
        const pipelineId = ensureAggregatePipeline(
          file,
          source,
          match.index,
          technology,
          receiver,
          {
            ...(bound
              ? { collectionName: bound, bindingName: receiver }
              : looksLikeModelName(receiver)
                ? { modelName: receiver }
                : { collectionName: receiver }),
            stages,
            detail: `${receiver}.aggregate`,
          },
        );
        edges.push(
          edgeFrom(
            "uses",
            pipelineId,
            collectionId,
            evidence(file, source, match.index, "aggregates"),
            "query",
          ),
        );
      }
    }

    return {
      extractor: { id: this.id, version: this.version },
      nodes,
      edges,
    };
  },
};
