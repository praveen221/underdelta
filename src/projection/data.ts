import { edgeFrom, stableId } from "../graph.js";
import type {
  ArchitectureEdge,
  ArchitectureNode,
  Evidence,
} from "../schema.js";
import { dedupeEvidence, projectionEvidence } from "./common.js";
import {
  formatProductWord,
  humanizeIdentifierLabel,
  isProductAcronym,
  operationStoryLabel,
} from "./labels.js";
import { scheduledWorkSourcesForHandler } from "./scheduledWork.js";

type AttachToSystem = (
  nodeId: string,
  systemId: string,
  evidence: Evidence,
) => void;

export function createDataAccessSystem(evidence: Evidence): ArchitectureNode {
  return {
    id: stableId("system", "data"),
    kind: "system",
    label: "Data access",
    technology: "semantic",
    metadata: { projection: "semantic", systemKey: "data" },
    evidence: [evidence],
  };
}

function normalizeTableKey(label: string): string {
  let value = label.trim().toLowerCase();
  if (value.includes(".")) {
    value = value.slice(value.lastIndexOf(".") + 1);
  }
  if (value.endsWith("ies") && value.length > 3) {
    value = `${value.slice(0, -3)}y`;
  } else if (value.endsWith("s") && !value.endsWith("ss") && value.length > 3) {
    value = value.slice(0, -1);
  }
  return value;
}

function normalizeColumnKey(label: string): string {
  return label.trim().replaceAll("_", "").toLowerCase();
}

function titleCaseSingular(label: string): string {
  const key = normalizeTableKey(label);
  if (!key) return label;
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part, index) => formatProductWord(part, index))
    .join(" ");
}

function isSqlFamilyTable(node: ArchitectureNode): boolean {
  return (
    node.technology === "sql" ||
    node.technology === "alembic" ||
    node.technology === "sqlalchemy"
  );
}

function isMongoCollection(node: ArchitectureNode): boolean {
  return (
    node.kind === "collection" &&
    (node.technology === "mongoose" || node.technology === "mongodb")
  );
}

/** SCREAMING_SNAKE const names used as `.collection(CONST)` args. */
function isScreamingSnakeBinding(name: string): boolean {
  return /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(name);
}

/**
 * Collection-handle crumbs that become junk overview hubs
 * (`C pipeline`, `Col pipeline`) on foreign Mongo apps (Shree Heart).
 * Real product stems (Note, Search chunks, Tag) stay.
 */
const TRIVIAL_MONGO_AGGREGATE_HANDLES = new Set([
  "c",
  "col",
  "coll",
  "cols",
  "colls",
  "collection",
  "collections",
  "doc",
  "docs",
  "row",
  "rows",
  "cur",
  "cursor",
  "agg",
  "tmp",
  "temp",
  "res",
  "obj",
  "arr",
  "val",
  "item",
  "items",
  "data",
  "db",
  "rec",
  "recs",
  "ent",
  "ents",
  "mod",
  "model",
  "models",
  "schema",
  "test",
  "tests",
  "scratch",
  "junk",
  "mock",
  "dummy",
  "sample",
  "foo",
  "bar",
  "baz",
  "misc",
]);

/** Trailing driver-handle suffixes glued onto short prefixes (`Qcol`, `Testscollection`). */
const TRIVIAL_MONGO_HANDLE_SUFFIX =
  /(?:collections?|colls?|cols?)$/i;

/**
 * True when a stem (after stripping col/collection) is itself a short/generic
 * handle rather than a product word (Note, Search chunks).
 */
function isTrivialMongoAggregateStem(stem: string): boolean {
  if (!stem) return true;
  const compact = stem.replace(/\s+/g, "");
  if (!compact) return true;
  if (/^[A-Za-z]$/.test(compact)) return true;
  if (TRIVIAL_MONGO_AGGREGATE_HANDLES.has(compact.toLowerCase())) return true;
  // Two-letter alpha crumbs (cx, tx) — keep known product acronyms (AI, DB).
  if (
    /^[A-Za-z]{2}$/.test(compact) &&
    !isProductAcronym(compact)
  ) {
    return true;
  }
  return false;
}

/**
 * True when a mongo aggregate pipeline label is a short variable/handle crumb
 * rather than a product collection story (Shree Heart field gate).
 *
 * Covers bare handles (`C`, `Col`), prefixed crumbs (`Qcol`, `Q Col`), and
 * glued `*collection` leftovers (`Testscollection`, `Tests Collection`).
 */
export function isTrivialMongoAggregateLabel(label: string): boolean {
  const stem = label.replace(/\s+pipeline$/i, "").trim();
  if (!stem) return true;
  if (isTrivialMongoAggregateStem(stem)) return true;

  const compact = stem.replace(/\s+/g, "");
  // Prefixed / glued handle crumbs: Qcol, XColl, Testscollection.
  if (TRIVIAL_MONGO_HANDLE_SUFFIX.test(compact)) {
    const withoutSuffix = compact.replace(TRIVIAL_MONGO_HANDLE_SUFFIX, "");
    if (isTrivialMongoAggregateStem(withoutSuffix)) return true;
    // Glued identifier crumbs (`Testscollection`) — short non-product prefix
    // with no spaces in the original stem means a variable leftover, not a
    // titled product collection hub.
    if (
      !/\s/.test(stem) &&
      withoutSuffix.length > 0 &&
      withoutSuffix.length <= 8 &&
      /^[A-Za-z]+$/i.test(withoutSuffix)
    ) {
      return true;
    }
  }

  // Spaced "... Collection" where the leading words are generic handles
  // (`Tests Collection` from testsCollection).
  const words = stem.split(/\s+/);
  if (
    words.length >= 2 &&
    /^collections?$/i.test(words[words.length - 1] ?? "")
  ) {
    const prefix = words.slice(0, -1).join("");
    if (isTrivialMongoAggregateStem(prefix)) return true;
  }

  return false;
}

function preferredCollectionLabel(bucket: ArchitectureNode[]): string {
  const ranked = [...bucket].sort((a, b) => {
    const rankDiff = collectionRank(b) - collectionRank(a);
    if (rankDiff !== 0) return rankDiff;
    return a.id.localeCompare(b.id);
  });
  const best = ranked[0]!;
  // mongoose.model("Note") already carries the product word.
  if (
    best.technology === "mongoose" &&
    !best.metadata?.discoveredFromUsage &&
    /^[A-Z]/.test(best.label)
  ) {
    return best.label;
  }
  // Prefer RAG_CHUNKS → "RAG chunks" over rag_chunks → "Rag chunk".
  const binding = ranked
    .map((node) => node.metadata?.bindingName)
    .find(
      (name): name is string =>
        typeof name === "string" && isScreamingSnakeBinding(name),
    );
  if (binding) return humanizeIdentifierLabel(binding);
  const raw =
    (typeof best.metadata?.collectionName === "string"
      ? best.metadata.collectionName
      : best.label) ?? best.label;
  return titleCaseSingular(String(raw));
}

function collectionRank(node: ArchitectureNode): number {
  if (node.technology === "mongoose" && !node.metadata?.discoveredFromUsage) {
    return /^[A-Z]/.test(node.label) ? 3 : 2;
  }
  if (node.technology === "mongodb" && !node.metadata?.discoveredFromUsage) {
    return 2;
  }
  if (node.metadata?.discoveredFromUsage) return 1;
  return 0;
}

function preferredTableLabel(bucket: ArchitectureNode[]): string {
  const ranked = [...bucket].sort((a, b) => {
    const rankDiff = tableRank(b) - tableRank(a);
    if (rankDiff !== 0) return rankDiff;
    return a.id.localeCompare(b.id);
  });
  const best = ranked[0]!;
  if (best.technology === "prisma" && !best.metadata?.discoveredFromUsage) {
    return best.label;
  }
  if (isSqlFamilyTable(best)) {
    const raw = best.label.trim();
    // Keep `_ArticleToTag`-style join chrome so collapse can still see the `_`.
    if (raw.startsWith("_") || /(^|\.)_/.test(raw)) {
      return raw.includes(".")
        ? raw.slice(raw.lastIndexOf(".") + 1)
        : raw;
    }
    // Keep Alembic junction names (`articles_to_tags`) recognizable for collapse.
    if (/_to_/i.test(raw)) return raw;
    const titled = titleCaseSingular(best.label);
    // commentaries → Commentary via plural strip; product word is Comment.
    if (normalizeTableKey(titled) === "commentary") return "Comment";
    return titled;
  }
  return best.label;
}

function tableRank(node: ArchitectureNode): number {
  if (node.technology === "prisma" && !node.metadata?.discoveredFromUsage) {
    return 3;
  }
  // Alembic migrations outrank ORM/query-helper table declarations.
  if (node.technology === "sql" || node.technology === "alembic") return 2;
  if (node.technology === "sqlalchemy") return 2;
  if (node.metadata?.discoveredFromUsage) return 1;
  return 0;
}

/** Turn Prisma field chrome into product words for the default browser. */
function humanizeRelationField(label: string): string {
  switch (label) {
    case "favoritedBy":
      return "favorited by";
    case "followedBy":
      return "followed by";
    case "tagList":
      return "tags";
    default:
      return label;
  }
}

/**
 * Merge multiple Prisma field names on the same directed table pair into one
 * human label. `followedBy` + `following` → `follows` so User↔User reads as a
 * product story instead of ORM navigation chrome.
 */
function mergeRelationLabels(labels: Iterable<string>): string | undefined {
  const set = new Set<string>();
  for (const label of labels) {
    // Prior merges join with ` / ` — split so re-merge does not duplicate parts.
    for (const part of label.split(/\s*\/\s*/)) {
      const trimmed = part.trim();
      // Drop ORM/SQL chrome words — only product vocabulary stays.
      if (
        !trimmed ||
        trimmed === "depends-on" ||
        trimmed === "references"
      ) {
        continue;
      }
      set.add(trimmed);
    }
  }
  if (set.has("followedBy") && set.has("following")) {
    set.delete("followedBy");
    set.delete("following");
    set.add("follows");
  }
  // User→Article often has both 1:n authored posts and M2M favorites.
  if (set.has("articles") && set.has("favorites")) {
    set.delete("articles");
    set.add("authored");
  }
  if (set.size === 0) return undefined;
  return [...set]
    .map(humanizeRelationField)
    .sort((a, b) => a.localeCompare(b))
    .join(" / ");
}

/**
 * Prisma M2M join tables (`_ArticleToTag`, `_UserFavorites`) and dropped
 * explicit join aliases (`ArticleTags` → articletag) that only restate two
 * already-known Prisma models.
 */
function isJoinTableNoise(
  node: ArchitectureNode,
  prismaTableKeys: Set<string>,
): boolean {
  const label = node.label.trim();
  const sqlName = String(node.metadata?.sqlName ?? "");
  const aliasNames = Array.isArray(node.metadata?.aliases)
    ? (node.metadata.aliases as unknown[]).map((item) => String(item))
    : [];
  const candidates = [label, sqlName, ...aliasNames];
  if (
    candidates.some(
      (name) => name.trim().startsWith("_") || /(^|\.)_/.test(name.trim()),
    )
  ) {
    return true;
  }
  // Alembic/SQL junctions: followers_to_followings, articles_to_tags.
  if (candidates.some((name) => /_to_/i.test(name.trim()))) {
    return true;
  }
  // Extractor-marked FK-only tables (favorites) without Prisma models.
  if (node.metadata?.joinTableCandidate === true) {
    return true;
  }

  const sources = Array.isArray(node.metadata?.sources)
    ? (node.metadata.sources as string[])
    : node.technology
      ? [node.technology]
      : [];
  const sqlFamily = new Set(["sql", "alembic", "sqlalchemy"]);
  const sqlOnly =
    sources.length > 0 && sources.every((source) => sqlFamily.has(source));
  if (!sqlOnly || prismaTableKeys.size < 2) return false;

  const key = normalizeTableKey(label);
  // Skip if this already is (or unified with) a Prisma model.
  if (prismaTableKeys.has(key)) return false;

  const keys = [...prismaTableKeys];
  for (let i = 0; i < keys.length; i++) {
    for (let j = 0; j < keys.length; j++) {
      if (i === j) continue;
      if (key === `${keys[i]}${keys[j]}`) return true;
    }
  }
  return false;
}

function columnRank(node: ArchitectureNode): number {
  if (node.technology === "prisma" && node.metadata?.relation) return 4;
  if (node.technology === "prisma") return 3;
  if (node.technology === "sql") return 2;
  return 0;
}


/** Walk parentId until a semantic system/molecule hub. */
function semanticOwnerOf(
  nodeId: string,
  nodes: Map<string, ArchitectureNode>,
): ArchitectureNode | undefined {
  let current: string | undefined = nodeId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = nodes.get(current);
    if (!node) return undefined;
    if (node.metadata?.projection === "semantic") return node;
    current = node.parentId;
  }
  return undefined;
}

type LineSpan = { file: string; start: number; end: number };

function evidenceSpans(node: ArchitectureNode): LineSpan[] {
  const spans: LineSpan[] = [];
  for (const item of node.evidence) {
    const range = item.range;
    if (!range) continue;
    spans.push({
      file: item.file,
      start: range.startLine,
      end: range.endLine,
    });
  }
  return spans;
}

function evidenceHitsSpan(
  edge: ArchitectureEdge,
  spans: readonly LineSpan[],
): boolean {
  for (const item of edge.evidence) {
    const line = item.range?.startLine;
    if (line === undefined) continue;
    for (const span of spans) {
      if (item.file === span.file && line >= span.start && line <= span.end) {
        return true;
      }
    }
  }
  return false;
}

/**
 * BE story edges API/Jobs/routes → Data + resources (deterministic, evidence-backed):
 * - When an API-owned function queries/reads/writes a resource under Data, lift the
 *   molecule edge (API→Data) and the table insight edge (API→table).
 * - When a Data-owned function does the Prisma I/O but an API function `calls`
 *   it (Checkout → fulfillOrder → Order), lift through that call bridge.
 * - When Jobs schedules a function that accesses Data, lift Jobs→Data
 *   and Jobs→table so Intermediate table focus answers “who writes this?”.
 * - When an HTTP route binds a handler (`routes-to` or a same-file `calls`
 *   inside the route's evidence span), lift `POST /articles → writes Article`.
 */
export function liftDataAccessStoryEdges(
  nodes: Map<string, ArchitectureNode>,
  edges: Map<string, ArchitectureEdge>,
  systems: Map<string, ArchitectureNode>,
): void {
  const api = systems.get("api");
  const data = systems.get("data");
  const jobs = systems.get("jobs");
  if (!data) return;

  const liftedKinds = new Set<string>();

  const addLifted = (
    kind: "queries" | "reads" | "writes",
    from: ArchitectureNode,
    to: ArchitectureNode,
    viaCaller: ArchitectureNode | undefined,
    viaFn: ArchitectureNode,
    seed: Evidence,
  ): void => {
    const dedupeKey = `${kind}:${from.id}:${to.id}`;
    if (liftedKinds.has(dedupeKey)) return;
    const detail = viaCaller
      ? `${from.label} ${kind} ${to.label} via ${viaCaller.label} → ${viaFn.label}`
      : `${from.label} ${kind} ${to.label} via ${viaFn.label}`;
    const label = operationStoryLabel(kind, to.label, to.kind);
    const lifted = edgeFrom(
      kind,
      from.id,
      to.id,
      {
        ...seed,
        extractor: "projection",
        certainty: "derived",
        detail,
      },
      label,
    );
    lifted.metadata = { ...lifted.metadata, operationStory: true };
    if (!edges.has(lifted.id)) edges.set(lifted.id, lifted);
    liftedKinds.add(dedupeKey);
  };

  const liftOwnerStory = (
    kind: "queries" | "reads" | "writes",
    from: ArchitectureNode,
    table: ArchitectureNode,
    viaCaller: ArchitectureNode | undefined,
    viaFn: ArchitectureNode,
    seed: Evidence,
  ): void => {
    addLifted(kind, from, data, viaCaller, viaFn, seed);
    addLifted(kind, from, table, viaCaller, viaFn, seed);
  };

  for (const edge of [...edges.values()]) {
    if (
      edge.kind !== "queries" &&
      edge.kind !== "reads" &&
      edge.kind !== "writes"
    ) {
      continue;
    }
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) continue;
    if (target.kind !== "table" && target.kind !== "collection") continue;
    const tableOwner = semanticOwnerOf(target.id, nodes);
    if (!tableOwner || tableOwner.id !== data.id) continue;

    const sourceOwner = semanticOwnerOf(source.id, nodes);
    const seed = edge.evidence[0]!;

    // Direct: API-owned function touches a Data table.
    if (api && sourceOwner?.id === api.id) {
      liftOwnerStory(edge.kind, api, target, undefined, source, seed);
      continue;
    }

    // Bridge: API function calls a Data-owned reader/writer (mini-stack Checkout).
    if (api && sourceOwner?.id === data.id) {
      for (const call of edges.values()) {
        if (call.kind !== "calls") continue;
        if (call.target !== source.id) continue;
        const caller = nodes.get(call.source);
        if (!caller) continue;
        const callerOwner = semanticOwnerOf(caller.id, nodes);
        if (callerOwner?.id !== api.id) continue;
        liftOwnerStory(edge.kind, api, target, caller, source, seed);
        break;
      }
    }

    // Scheduled work reaches handlers through trigger → job → handler.
    if (jobs && (sourceOwner?.id === data.id || sourceOwner?.id === jobs.id)) {
      for (const schedulerId of scheduledWorkSourcesForHandler(
        source.id,
        edges.values(),
      )) {
        const scheduler = nodes.get(schedulerId);
        if (!scheduler) continue;
        const schedulerOwner = semanticOwnerOf(scheduler.id, nodes);
        if (
          schedulerOwner?.id !== jobs.id &&
          scheduler.id !== jobs.id
        ) {
          continue;
        }
        liftOwnerStory(edge.kind, jobs, target, scheduler, source, seed);
        break;
      }
    }
  }

  // HTTP operations: route → table so Intermediate can read
  // `POST /articles → writes Article` instead of a nameless API→table line.
  for (const route of nodes.values()) {
    if (route.kind !== "route") continue;
    const bound = new Map<string, ArchitectureNode>();
    for (const edge of edges.values()) {
      if (edge.kind === "routes-to" && edge.source === route.id) {
        const target = nodes.get(edge.target);
        if (target) bound.set(target.id, target);
      }
    }
    const spans = evidenceSpans(route);
    if (spans.length > 0) {
      for (const edge of edges.values()) {
        if (edge.kind !== "calls") continue;
        if (!evidenceHitsSpan(edge, spans)) continue;
        const target = nodes.get(edge.target);
        if (target) bound.set(target.id, target);
      }
    }
    if (bound.size === 0) continue;

    const viaFns = new Map(bound);
    for (const handler of bound.values()) {
      if (handler.kind !== "function") continue;
      for (const edge of edges.values()) {
        if (edge.kind !== "calls" || edge.source !== handler.id) continue;
        const callee = nodes.get(edge.target);
        if (callee?.kind === "function") viaFns.set(callee.id, callee);
      }
    }

    for (const fn of viaFns.values()) {
      for (const edge of edges.values()) {
        if (edge.source !== fn.id) continue;
        if (
          edge.kind !== "queries" &&
          edge.kind !== "reads" &&
          edge.kind !== "writes"
        ) {
          continue;
        }
        const table = nodes.get(edge.target);
        if (
          !table ||
          (table.kind !== "table" && table.kind !== "collection")
        ) {
          continue;
        }
        const tableOwner = semanticOwnerOf(table.id, nodes);
        if (!tableOwner || tableOwner.id !== data.id) continue;
        addLifted(edge.kind, route, table, undefined, fn, edge.evidence[0]!);
      }
    }
  }
}


export function projectDataArchitecture(args: {
  nodes: Map<string, ArchitectureNode>;
  edges: Map<string, ArchitectureEdge>;
  systems: Map<string, ArchitectureNode>;
  attachToSystem: AttachToSystem;
}): void {
  const { nodes, edges, systems, attachToSystem } = args;
  // Attach databases discovered only via Prisma/SQL files to Data access.
  const dataSystem = systems.get("data");
  if (dataSystem) {
    for (const node of [...nodes.values()]) {
      if (node.kind === "database" || node.kind === "schema") {
        attachToSystem(
          node.id,
          dataSystem.id,
          node.evidence[0] ?? projectionEvidence("."),
        );
      }
    }
  }

  // Collapse duplicate table nodes (Order / order / orders) and polish names.
  const tablesByKey = new Map<string, ArchitectureNode[]>();
  for (const node of nodes.values()) {
    if (node.kind !== "table") continue;
    const key = normalizeTableKey(node.label);
    const bucket = tablesByKey.get(key) ?? [];
    bucket.push(node);
    tablesByKey.set(key, bucket);
  }

  const redirect = new Map<string, string>();
  for (const [key, bucket] of tablesByKey) {
    const ranked = [...bucket].sort((a, b) => {
      const rankDiff = tableRank(b) - tableRank(a);
      if (rankDiff !== 0) return rankDiff;
      return a.id.localeCompare(b.id);
    });
    const canonical = ranked[0]!;
    const aliases = [
      ...new Set(
        ranked
          .map((node) => node.label)
          .filter((label) => label !== preferredTableLabel(ranked)),
      ),
    ];
    const prismaName = ranked.find(
      (node) =>
        node.technology === "prisma" && !node.metadata?.discoveredFromUsage,
    )?.label;
    const sqlName = ranked.find((node) => isSqlFamilyTable(node))?.label ??
      (typeof ranked[0]?.metadata?.sqlName === "string"
        ? ranked[0].metadata.sqlName
        : undefined);
    const sources = [
      ...new Set(
        ranked
          .map((node) => node.technology)
          .filter((tech): tech is string => Boolean(tech)),
      ),
    ];
    canonical.label = preferredTableLabel(ranked);
    const joinCandidate = ranked.some(
      (node) => node.metadata?.joinTableCandidate === true,
    );
    canonical.metadata = {
      ...canonical.metadata,
      aliases,
      normalizedTable: key,
      ...(prismaName ? { prismaName } : {}),
      ...(sqlName ? { sqlName } : {}),
      sources,
      ...(joinCandidate ? { joinTableCandidate: true } : {}),
    };
    for (const duplicate of ranked.slice(1)) {
      for (const child of nodes.values()) {
        if (child.parentId === duplicate.id) {
          child.parentId = canonical.id;
          nodes.set(child.id, child);
        }
      }
      redirect.set(duplicate.id, canonical.id);
      canonical.evidence.push(...duplicate.evidence);
      nodes.delete(duplicate.id);
    }
    canonical.evidence = dedupeEvidence(canonical.evidence);
    nodes.set(canonical.id, canonical);
  }

  // Retarget edges before re-parenting so SQL→Prisma redirects do not
  // resurrect stale product/database contains links.
  for (const [edgeId, edge] of [...edges.entries()]) {
    const source = redirect.get(edge.source) ?? edge.source;
    const target = redirect.get(edge.target) ?? edge.target;
    if (!nodes.has(source) || !nodes.has(target)) {
      edges.delete(edgeId);
      continue;
    }
    if (source === edge.source && target === edge.target) continue;
    edges.delete(edgeId);
    if (source === target) continue;
    const retargeted = edgeFrom(
      edge.kind,
      source,
      target,
      edge.evidence[0]!,
      edge.label,
    );
    edges.set(retargeted.id, retargeted);
  }

  // Nest unified tables under Data access and keep migration edges intact.
  if (dataSystem) {
    for (const node of [...nodes.values()]) {
      if (node.kind !== "table") continue;
      attachToSystem(
        node.id,
        dataSystem.id,
        node.evidence[0] ?? projectionEvidence("."),
      );
    }

    // Overview: when Catalog data already has tables, hide Prisma database /
    // SQL migration schema leaves — tables tell the data story. (Attach to
    // dataSystem happens after the general leaf-collapse pass, so mark here.)
    const hasTables = [...nodes.values()].some(
      (node) => node.kind === "table" && node.parentId === dataSystem.id,
    );
    if (hasTables) {
      for (const node of nodes.values()) {
        if (
          (node.kind === "database" || node.kind === "schema") &&
          node.parentId === dataSystem.id
        ) {
          node.metadata = {
            ...node.metadata,
            collapsedInOverview: true,
          };
          nodes.set(node.id, node);
        }
      }
    }
  }

  // Collapse duplicate Mongo collections (Note / notes) and nest under Data.
  const collectionsByKey = new Map<string, ArchitectureNode[]>();
  for (const node of nodes.values()) {
    if (!isMongoCollection(node)) continue;
    const key = normalizeTableKey(
      typeof node.metadata?.collectionName === "string"
        ? node.metadata.collectionName
        : node.label,
    );
    const bucket = collectionsByKey.get(key) ?? [];
    bucket.push(node);
    collectionsByKey.set(key, bucket);
  }

  const collectionRedirect = new Map<string, string>();
  for (const [key, bucket] of collectionsByKey) {
    const ranked = [...bucket].sort((a, b) => {
      const rankDiff = collectionRank(b) - collectionRank(a);
      if (rankDiff !== 0) return rankDiff;
      return a.id.localeCompare(b.id);
    });
    const canonical = ranked[0]!;
    const aliases = [
      ...new Set(
        ranked
          .map((node) => node.label)
          .filter((label) => label !== preferredCollectionLabel(ranked)),
      ),
    ];
    const collectionName =
      ranked.find(
        (node) => typeof node.metadata?.collectionName === "string",
      )?.metadata?.collectionName ??
      (typeof canonical.metadata?.collectionName === "string"
        ? canonical.metadata.collectionName
        : undefined);
    const sources = [
      ...new Set(
        ranked
          .map((node) => node.technology)
          .filter((tech): tech is string => Boolean(tech)),
      ),
    ];
    canonical.label = preferredCollectionLabel(ranked);
    canonical.metadata = {
      ...canonical.metadata,
      aliases,
      normalizedTable: key,
      ...(collectionName ? { collectionName: String(collectionName) } : {}),
      sources,
    };
    for (const duplicate of ranked.slice(1)) {
      for (const child of nodes.values()) {
        if (child.parentId === duplicate.id) {
          child.parentId = canonical.id;
          nodes.set(child.id, child);
        }
      }
      collectionRedirect.set(duplicate.id, canonical.id);
      canonical.evidence.push(...duplicate.evidence);
      nodes.delete(duplicate.id);
    }
    canonical.evidence = dedupeEvidence(canonical.evidence);
    nodes.set(canonical.id, canonical);
  }

  if (collectionRedirect.size > 0) {
    for (const [edgeId, edge] of [...edges.entries()]) {
      const source = collectionRedirect.get(edge.source) ?? edge.source;
      const target = collectionRedirect.get(edge.target) ?? edge.target;
      if (!nodes.has(source) || !nodes.has(target)) {
        edges.delete(edgeId);
        continue;
      }
      if (source === edge.source && target === edge.target) continue;
      edges.delete(edgeId);
      if (source === target) continue;
      const retargeted = edgeFrom(
        edge.kind,
        source,
        target,
        edge.evidence[0]!,
        edge.label,
      );
      edges.set(retargeted.id, retargeted);
    }
  }

  if (dataSystem) {
    for (const node of [...nodes.values()]) {
      if (!isMongoCollection(node)) continue;
      attachToSystem(
        node.id,
        dataSystem.id,
        node.evidence[0] ?? projectionEvidence("."),
      );
    }

    const hasCollections = [...nodes.values()].some(
      (node) =>
        isMongoCollection(node) && node.parentId === dataSystem.id,
    );
    if (hasCollections) {
      for (const node of nodes.values()) {
        if (
          (node.kind === "database" || node.kind === "schema") &&
          node.parentId === dataSystem.id
        ) {
          node.metadata = {
            ...node.metadata,
            collapsedInOverview: true,
          };
          nodes.set(node.id, node);
        }
      }
    }

    // Mongo `.aggregate` pipelines are the RAG/query story beside collections.
    // Nest under Data access, humanize labels from the canonical collection,
    // and keep them visible on overview (pipeline-steps stay Details-only).
    const collectionsByNormalized = new Map<string, ArchitectureNode>();
    for (const node of nodes.values()) {
      if (!isMongoCollection(node)) continue;
      const key = normalizeTableKey(
        typeof node.metadata?.collectionName === "string"
          ? node.metadata.collectionName
          : node.label,
      );
      collectionsByNormalized.set(key, node);
      collectionsByNormalized.set(normalizeTableKey(node.label), node);
    }
    for (const node of [...nodes.values()]) {
      if (node.kind !== "pipeline" || node.metadata?.mongoAggregate !== true) {
        continue;
      }
      const binding =
        typeof node.metadata?.bindingName === "string"
          ? node.metadata.bindingName
          : undefined;
      const modelName =
        typeof node.metadata?.modelName === "string"
          ? node.metadata.modelName
          : undefined;
      const collectionName =
        typeof node.metadata?.collectionName === "string"
          ? node.metadata.collectionName
          : undefined;
      const matchKey = normalizeTableKey(
        collectionName ?? modelName ?? binding ?? node.label,
      );
      const collection =
        collectionsByNormalized.get(matchKey) ??
        (modelName
          ? collectionsByNormalized.get(normalizeTableKey(modelName))
          : undefined) ??
        (binding
          ? collectionsByNormalized.get(normalizeTableKey(binding))
          : undefined);
      const baseLabel = collection
        ? collection.label
        : binding && isScreamingSnakeBinding(binding)
          ? humanizeIdentifierLabel(binding)
          : modelName && /^[A-Z]/.test(modelName)
            ? modelName
            : humanizeIdentifierLabel(
                collectionName ?? modelName ?? binding ?? node.label,
              ).replace(/\s+pipeline$/i, "");
      const nextLabel = `${baseLabel} pipeline`;
      if (nextLabel !== node.label) {
        node.metadata = {
          ...node.metadata,
          technicalLabel: node.label,
        };
        node.label = nextLabel;
      }
      attachToSystem(
        node.id,
        dataSystem.id,
        node.evidence[0] ?? projectionEvidence("."),
      );
      // Junk handle crumbs (`C pipeline`, `Col pipeline`) stay off
      // Beginner/overview — real product aggregates remain overview hubs.
      const trivial = isTrivialMongoAggregateLabel(nextLabel);
      node.metadata = {
        ...node.metadata,
        ...(trivial
          ? {
              trivialMongoAggregate: true,
              overviewHub: false,
              collapsedInOverview: true,
            }
          : {
              overviewHub: true,
              collapsedInOverview: false,
            }),
      };
      nodes.set(node.id, node);
      // Stage leaves (Filter/Group/Sort) stay Details-only — the hub label
      // carries the aggregate story beside collections on overview.
      for (const step of nodes.values()) {
        if (step.kind !== "pipeline-step" || step.parentId !== node.id) continue;
        step.metadata = {
          ...step.metadata,
          collapsedInOverview: true,
        };
        nodes.set(step.id, step);
      }
    }
  }

  // Collapse duplicate columns (created_at / createdAt, order_id / orderId).
  const columnsByTable = new Map<string, ArchitectureNode[]>();
  for (const node of nodes.values()) {
    if (node.kind !== "column" || !node.parentId) continue;
    const bucket = columnsByTable.get(node.parentId) ?? [];
    bucket.push(node);
    columnsByTable.set(node.parentId, bucket);
  }
  const columnRedirect = new Map<string, string>();
  for (const [tableId, columns] of columnsByTable) {
    const byKey = new Map<string, ArchitectureNode[]>();
    for (const column of columns) {
      const key = normalizeColumnKey(column.label);
      const bucket = byKey.get(key) ?? [];
      bucket.push(column);
      byKey.set(key, bucket);
    }
    for (const [key, bucket] of byKey) {
      if (bucket.length < 2) continue;
      const ranked = [...bucket].sort((a, b) => {
        const rankDiff = columnRank(b) - columnRank(a);
        if (rankDiff !== 0) return rankDiff;
        // Prefer camelCase Prisma-style labels over snake_case.
        const camelDiff =
          Number(b.label.includes("_") ? 0 : 1) -
          Number(a.label.includes("_") ? 0 : 1);
        if (camelDiff !== 0) return camelDiff;
        return a.id.localeCompare(b.id);
      });
      const canonical = ranked[0]!;
      canonical.metadata = {
        ...canonical.metadata,
        aliases: ranked.slice(1).map((node) => node.label),
        normalizedColumn: key,
      };
      for (const duplicate of ranked.slice(1)) {
        columnRedirect.set(duplicate.id, canonical.id);
        canonical.evidence.push(...duplicate.evidence);
        nodes.delete(duplicate.id);
      }
      canonical.evidence = dedupeEvidence(canonical.evidence);
      canonical.parentId = tableId;
      nodes.set(canonical.id, canonical);
    }
  }

  for (const [edgeId, edge] of [...edges.entries()]) {
    const source = columnRedirect.get(edge.source) ?? edge.source;
    const target = columnRedirect.get(edge.target) ?? edge.target;
    if (!nodes.has(source) || !nodes.has(target)) {
      edges.delete(edgeId);
      continue;
    }
    if (source === edge.source && target === edge.target) continue;
    edges.delete(edgeId);
    if (source === target) continue;
    const retargeted = edgeFrom(
      edge.kind,
      source,
      target,
      edge.evidence[0]!,
      edge.label,
    );
    edges.set(retargeted.id, retargeted);
  }

  // Keep one table↔table relation edge per directed pair. When Prisma exposes
  // multiple field names (articles + favorites), merge labels so favorites /
  // follows stay on the data story instead of being dropped by dedupe.
  const tableIds = new Set(
    [...nodes.values()].filter((node) => node.kind === "table").map((n) => n.id),
  );
  const relationBest = new Map<string, ArchitectureEdge>();
  const relationLabels = new Map<string, Set<string>>();
  for (const [edgeId, edge] of [...edges.entries()]) {
    if (edge.kind !== "depends-on") continue;
    if (!tableIds.has(edge.source) || !tableIds.has(edge.target)) continue;
    const pairKey = `${edge.source}->${edge.target}`;
    const labels = relationLabels.get(pairKey) ?? new Set<string>();
    if (edge.label) labels.add(edge.label);
    relationLabels.set(pairKey, labels);
    const existing = relationBest.get(pairKey);
    const score =
      (edge.label && edge.label !== "references" ? 2 : 0) +
      (edge.evidence.some((item) => item.extractor === "prisma") ? 1 : 0);
    const existingScore = existing
      ? (existing.label && existing.label !== "references" ? 2 : 0) +
        (existing.evidence.some((item) => item.extractor === "prisma") ? 1 : 0)
      : -1;
    if (!existing || score > existingScore) {
      if (existing) edges.delete(existing.id);
      relationBest.set(pairKey, edge);
    } else {
      edges.delete(edgeId);
    }
  }
  for (const [pairKey, edge] of relationBest) {
    const merged = mergeRelationLabels(relationLabels.get(pairKey) ?? []);
    if (!merged || merged === edge.label) continue;
    edges.delete(edge.id);
    const relabeled = edgeFrom(
      edge.kind,
      edge.source,
      edge.target,
      edge.evidence[0]!,
      merged,
    );
    relabeled.evidence = dedupeEvidence([
      ...edge.evidence,
      projectionEvidence(
        edge.evidence[0]?.file ?? ".",
        `Merged relation labels: ${merged}`,
      ),
    ]);
    edges.set(relabeled.id, relabeled);
    relationBest.set(pairKey, relabeled);
  }

  // Relation-only Prisma fields (order / payments) are ORM navigation, not
  // schema columns. Collapse them on the default map; table↔table edges remain.
  for (const node of nodes.values()) {
    if (node.kind !== "column" || !node.metadata?.relation) continue;
    node.metadata = {
      ...node.metadata,
      relationOnly: true,
      collapsedInOverview: true,
    };
    nodes.set(node.id, node);
  }

  // Prisma implicit M2M join tables (`_ArticleToTag`) and obsolete SQL join
  // aliases (`ArticleTags`) restate many-to-many edges. Collapse them on the
  // default map; real models (Article/Tag/User) carry the data story.
  const prismaTableKeys = new Set(
    [...nodes.values()]
      .filter(
        (node) =>
          node.kind === "table" &&
          (node.technology === "prisma" ||
            (Array.isArray(node.metadata?.sources) &&
              (node.metadata.sources as string[]).includes("prisma"))),
      )
      .map((node) => normalizeTableKey(String(node.metadata?.prismaName ?? node.label))),
  );
  const joinTableIds = new Set<string>();
  for (const node of [...nodes.values()]) {
    if (node.kind !== "table") continue;
    if (!isJoinTableNoise(node, prismaTableKeys)) continue;
    joinTableIds.add(node.id);
    node.metadata = {
      ...node.metadata,
      joinTable: true,
      collapsedInOverview: true,
    };
    nodes.set(node.id, node);
    for (const child of nodes.values()) {
      if (child.parentId !== node.id || child.kind !== "column") continue;
      child.metadata = {
        ...child.metadata,
        joinTable: true,
        collapsedInOverview: true,
      };
      nodes.set(child.id, child);
    }
  }

  // Lift Alembic/SQL M2M join tables into product relations before dropping
  // their FK edges — otherwise favorites/follows/tags vanish from the story.
  if (joinTableIds.size > 0) {
    const productTables = [...nodes.values()].filter(
      (node) => node.kind === "table" && !joinTableIds.has(node.id),
    );
    const tableByNorm = new Map<string, ArchitectureNode>();
    for (const table of productTables) {
      tableByNorm.set(normalizeTableKey(table.label), table);
      const sqlName = table.metadata?.sqlName;
      if (typeof sqlName === "string" && sqlName.trim()) {
        tableByNorm.set(normalizeTableKey(sqlName), table);
      }
    }
    const resolveFkTable = (raw: string): ArchitectureNode | undefined =>
      tableByNorm.get(normalizeTableKey(raw));

    const addProductRelation = (
      source: ArchitectureNode,
      target: ArchitectureNode,
      label: string,
      evidence: Evidence,
    ) => {
      const liftEvidence: Evidence = {
        ...evidence,
        extractor: "projection",
        certainty: "derived",
        detail: `Lifted join relation: ${label}`,
      };
      // Merge into any existing directed pair so Prisma favorites/follows are
      // not duplicated when the SQL join table is also collapsed.
      for (const existing of [...edges.values()]) {
        if (existing.kind !== "depends-on") continue;
        if (existing.source !== source.id || existing.target !== target.id) {
          continue;
        }
        const merged =
          mergeRelationLabels([existing.label ?? "", label]) ?? label;
        if (merged !== existing.label) {
          edges.delete(existing.id);
          const relabeled = edgeFrom(
            existing.kind,
            existing.source,
            existing.target,
            existing.evidence[0] ?? liftEvidence,
            merged,
          );
          relabeled.evidence = dedupeEvidence([
            ...existing.evidence,
            liftEvidence,
          ]);
          edges.set(relabeled.id, relabeled);
        } else {
          existing.evidence = dedupeEvidence([
            ...existing.evidence,
            liftEvidence,
          ]);
          edges.set(existing.id, existing);
        }
        return;
      }
      const edge = edgeFrom(
        "depends-on",
        source.id,
        target.id,
        liftEvidence,
        label,
      );
      edges.set(edge.id, edge);
    };

    for (const joinId of joinTableIds) {
      const join = nodes.get(joinId);
      if (!join) continue;
      const joinName = String(join.metadata?.sqlName ?? join.label);
      const joinKey = normalizeTableKey(joinName);
      const evidence = join.evidence[0] ?? projectionEvidence(".");
      const fkTargets = [...nodes.values()]
        .filter(
          (node) =>
            node.parentId === joinId &&
            node.kind === "column" &&
            typeof node.metadata?.foreignKeyTable === "string",
        )
        .map((node) => ({
          column: node.label,
          table: resolveFkTable(String(node.metadata?.foreignKeyTable)),
        }))
        .filter(
          (item): item is { column: string; table: ArchitectureNode } =>
            Boolean(item.table),
        );

      if (/favorite/i.test(joinKey) || /favorite/i.test(join.label)) {
        const user = fkTargets.find(
          (item) => normalizeTableKey(item.table.label) === "user",
        )?.table;
        const article = fkTargets.find(
          (item) => normalizeTableKey(item.table.label) === "article",
        )?.table;
        if (user && article) {
          addProductRelation(user, article, "favorites", evidence);
          addProductRelation(article, user, "favorited by", evidence);
        }
        continue;
      }

      if (/follow/i.test(joinKey) || /follow/i.test(join.label)) {
        const user = tableByNorm.get("user");
        if (user) {
          addProductRelation(user, user, "follows", evidence);
        }
        continue;
      }

      if (/tag/i.test(joinKey) || /tag/i.test(join.label)) {
        const tag = fkTargets.find(
          (item) => normalizeTableKey(item.table.label) === "tag",
        )?.table;
        // Article↔Tag (RealWorld) or Note↔Tag (mini-python) — any non-tag
        // product table on the junction owns the "tags" story edge.
        const tagged = fkTargets.find(
          (item) =>
            item.table.id !== tag?.id &&
            normalizeTableKey(item.table.label) !== "tag",
        )?.table;
        if (tagged && tag) {
          addProductRelation(tagged, tag, "tags", evidence);
        }
      }
    }

    // Drop FK edges into/out of collapsed join tables — product models now
    // carry favorites/follows/tags; join "references" edges only confuse.
    for (const [edgeId, edge] of [...edges.entries()]) {
      if (edge.kind !== "depends-on") continue;
      if (joinTableIds.has(edge.source) || joinTableIds.has(edge.target)) {
        edges.delete(edgeId);
      }
    }
  }

  // Humanize remaining SQL FK "references" into product words + reverse
  // authored edges so Article↔User reads like the Express RealWorld map.
  {
    const productTableById = new Map(
      [...nodes.values()]
        .filter(
          (node) => node.kind === "table" && node.metadata?.joinTable !== true,
        )
        .map((node) => [node.id, node] as const),
    );
    const fkColumnFromDetail = (edge: ArchitectureEdge): string => {
      for (const item of edge.evidence) {
        const match = /FOREIGN KEY\s+(\w+)/i.exec(item.detail ?? "");
        if (match?.[1]) return match[1];
      }
      return "";
    };
    for (const edge of [...edges.values()]) {
      if (edge.kind !== "depends-on") continue;
      const source = productTableById.get(edge.source);
      const target = productTableById.get(edge.target);
      if (!source || !target) continue;
      const column = fkColumnFromDetail(edge);
      let productWord: string | undefined;
      if (column === "author_id") {
        productWord = "author";
      } else if (column === "article_id" && /comment/i.test(source.label)) {
        productWord = "on";
      } else if (
        (!edge.label ||
          edge.label === "references" ||
          edge.label === "depends-on") &&
        column.endsWith("_id")
      ) {
        productWord = humanizeIdentifierLabel(column.slice(0, -3));
      }
      let label = edge.label;
      if (productWord) {
        label =
          mergeRelationLabels([edge.label ?? "", productWord]) ?? productWord;
      }
      if (label && label !== edge.label) {
        edges.delete(edge.id);
        const relabeled = edgeFrom(
          edge.kind,
          edge.source,
          edge.target,
          edge.evidence[0]!,
          label,
        );
        relabeled.evidence = dedupeEvidence(edge.evidence);
        edges.set(relabeled.id, relabeled);
      }
      // Article/Note -author→ User also implies User -authored→ Article/Note.
      const sourceKey = normalizeTableKey(source.label);
      if (
        label &&
        /\bauthor\b/i.test(label) &&
        (sourceKey === "article" || sourceKey === "note") &&
        normalizeTableKey(target.label) === "user"
      ) {
        const reverseEvidence: Evidence = {
          ...(edge.evidence[0] ?? projectionEvidence(".")),
          extractor: "projection",
          certainty: "derived",
          detail: "Reverse of author FK for product story",
        };
        let mergedIntoExisting = false;
        for (const existing of [...edges.values()]) {
          if (existing.kind !== "depends-on") continue;
          if (existing.source !== target.id || existing.target !== source.id) {
            continue;
          }
          const merged =
            mergeRelationLabels([existing.label ?? "", "authored"]) ??
            "authored";
          if (merged !== existing.label) {
            edges.delete(existing.id);
            const relabeled = edgeFrom(
              existing.kind,
              existing.source,
              existing.target,
              existing.evidence[0] ?? reverseEvidence,
              merged,
            );
            relabeled.evidence = dedupeEvidence([
              ...existing.evidence,
              reverseEvidence,
            ]);
            edges.set(relabeled.id, relabeled);
          }
          mergedIntoExisting = true;
          break;
        }
        if (!mergedIntoExisting) {
          const authored = edgeFrom(
            "depends-on",
            target.id,
            source.id,
            reverseEvidence,
            "authored",
          );
          edges.set(authored.id, authored);
        }
      }
    }
  }

}

export function preferExplicitDataStories(
  edges: Map<string, ArchitectureEdge>,
): void {
  for (const [edgeId, edge] of [...edges.entries()]) {
    if (
      edge.kind !== "reads" &&
      edge.kind !== "writes" &&
      edge.kind !== "queries" &&
      edge.kind !== "uses"
    ) {
      continue;
    }
    if (!edge.evidence.some((item) => item.certainty === "inferred")) continue;
    const hasDerivedStory = [...edges.values()].some(
      (other) =>
        other.id !== edge.id &&
        other.source === edge.source &&
        other.target === edge.target &&
        (other.kind === "queries" ||
          other.kind === "reads" ||
          other.kind === "writes") &&
        other.evidence.some(
          (item) =>
            item.certainty === "derived" && item.extractor === "projection",
        ),
    );
    if (hasDerivedStory) edges.delete(edgeId);
  }

}
