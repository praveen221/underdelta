import { Note, Tag, User } from "./db/models.js";

type Handler = (
  req: { body: Record<string, unknown> },
  res: { json: (value: unknown) => void },
) => void;

const app = {
  get(path: string, handler: Handler) {
    return { path, handler };
  },
  post(path: string, handler: Handler) {
    return { path, handler };
  },
};

// Native Mongo collections referenced via same-file string bindings
// (mirrors sahat/hackathon-starter RAG_CHUNKS / LLM_SEMANTIC_CACHE).
const SEARCH_CHUNKS = "search_chunks";
const QUERY_CACHE = "query_cache";
// Vector-search collection only reached via helper wrap (no bare .collection).
const VECTOR_DOCS = "vector_docs";

const db = {
  collection(name: string) {
    return {
      name,
      find: async () => [],
      aggregate: async (_pipeline: unknown[]) => [],
      createIndex: async (_spec: unknown) => undefined,
    };
  },
  listCollections(_filter: { name: string }) {
    return { toArray: async () => [] as { name: string }[] };
  },
  createCollection(name: string) {
    return db.collection(name);
  },
};

/**
 * Mirrors sahat/hackathon-starter createCollectionForVectorSearch —
 * wraps db.collection so extractors must see the helper call site.
 */
async function createCollectionForVectorSearch(
  database: typeof db,
  collectionName: string,
  indexes: Record<string, number>[],
) {
  const collection = database.collection(collectionName);
  for (const index of indexes) {
    await collection.createIndex(index);
  }
  return collection;
}

export async function warmSearchIndex() {
  void db.collection(SEARCH_CHUNKS);
  void db.collection(QUERY_CACHE);
}

/** Atlas-style vector collection setup — CONST only via helper. */
export async function setupVectorDocs() {
  await createCollectionForVectorSearch(db, VECTOR_DOCS, [{ topic: 1 }]);
}

/** RAG ranking via native driver aggregate on SEARCH_CHUNKS. */
export async function rankSearchChunks() {
  return db.collection(SEARCH_CHUNKS).aggregate([
    { $match: { active: true } },
    { $group: { _id: "$topic", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
}

/** Product totals via mongoose Model.aggregate. */
export async function countNotesByAuthor() {
  return Note.aggregate([
    { $match: { published: true } },
    { $group: { _id: "$author", total: { $sum: 1 } } },
  ]);
}

/**
 * Junk handle crumbs (Shree Heart field fail): short receivers must not become
 * Beginner/overview hubs like `C pipeline` / `Col pipeline`, nor leftover
 * prefixed crumbs (`Qcol`, `Testscollection` / `testsCollection`).
 */
export async function junkHandleAggregates() {
  const C = db.collection("scratch_c");
  const col = db.collection("scratch_col");
  const qCol = db.collection("scratch_qcol");
  const testsCollection = db.collection("scratch_tests");
  // Glued identifier leftover (no camelCase boundary) — Heart-style crumb.
  const Testscollection = db.collection("scratch_testscollection");
  await C.aggregate([{ $match: { ok: true } }]);
  await col.aggregate([{ $group: { _id: "$k", n: { $sum: 1 } } }]);
  await qCol.aggregate([{ $match: { q: true } }]);
  await testsCollection.aggregate([
    { $group: { _id: "$suite", n: { $sum: 1 } } },
  ]);
  await Testscollection.aggregate([{ $match: { leftover: true } }]);
}

export function listNotes(
  _req: { body: Record<string, unknown> },
  res: { json: (value: unknown) => void },
) {
  // Usage site for native-style collection access beside mongoose.model.
  void Note.find;
  void User.find;
  void Tag.find;
  res.json({ notes: [] });
}

export function createNote(
  req: { body: Record<string, unknown> },
  res: { json: (value: unknown) => void },
) {
  res.json({
    title: String(req.body.title ?? "Untitled"),
    authorId: String(req.body.authorId ?? ""),
  });
}

export function health(
  _req: { body: Record<string, unknown> },
  res: { json: (value: unknown) => void },
) {
  res.json({ ok: true });
}

app.get("/notes", listNotes);
app.post("/notes", createNote);
app.get("/health", health);
