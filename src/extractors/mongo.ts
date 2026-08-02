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

export const mongoExtractor: ArchitectureExtractor = {
  id: "mongo",
  version: "0.1.0",
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
        discoveredFromUsage?: boolean;
        detail?: string;
      } = {},
    ): string {
      const key = label.toLowerCase();
      const collectionId = stableId("collection", technology, key);
      if (seen.has(collectionId)) {
        const existing = nodes.find((node) => node.id === collectionId);
        if (
          existing &&
          extras.collectionName &&
          !existing.metadata?.collectionName
        ) {
          existing.metadata = {
            ...existing.metadata,
            collectionName: extras.collectionName,
          };
        }
        return collectionId;
      }
      seen.add(collectionId);
      const databaseId = ensureDatabase(file, source, offset, technology);
      const metadata: Record<string, unknown> = {};
      if (extras.collectionName) metadata.collectionName = extras.collectionName;
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

    for (const absolute of context.files) {
      const file = relativeFile(context.root, absolute);
      const source = await readFile(absolute, "utf8");
      const mentionsMongoose =
        /\bmongoose\b/.test(source) ||
        /from\s+['"]mongoose['"]/.test(source) ||
        /require\s*\(\s*['"]mongoose['"]\s*\)/.test(source);
      const mentionsMongoDriver =
        /\bmongodb\b/.test(source) ||
        /MongoClient/.test(source) ||
        /\.collection\s*\(/.test(source);

      if (!mentionsMongoose && !mentionsMongoDriver) continue;

      // mongoose.model("Note", schema) — primary Mongoose declaration.
      const modelPattern =
        /\bmongoose\.model(?:\s*<[^>]*>)?\s*\(\s*(['"])([^'"\n]+)\1/g;
      for (const match of source.matchAll(modelPattern)) {
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
        for (const match of source.matchAll(bareModelPattern)) {
          const name = cleanName(match[2] ?? "");
          if (!name || match.index === undefined) continue;
          // Skip if this was already captured as mongoose.model(...)
          const around = source.slice(
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
        for (const match of source.matchAll(schemaCollectionPattern)) {
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

      // Native driver: db.collection("notes") / client.db().collection('users')
      const nativeCollectionPattern =
        /\.collection\s*\(\s*(['"])([^'"\n]+)\1/g;
      for (const match of source.matchAll(nativeCollectionPattern)) {
        const collectionName = cleanName(match[2] ?? "");
        if (!collectionName || match.index === undefined) continue;
        ensureCollection(
          file,
          source,
          match.index,
          collectionName,
          mentionsMongoose ? "mongoose" : "mongodb",
          {
            collectionName,
            discoveredFromUsage: true,
            detail: `.collection(${JSON.stringify(collectionName)})`,
          },
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
