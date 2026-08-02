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

const db = {
  collection(name: string) {
    return {
      name,
      find: async () => [],
      aggregate: async (_pipeline: unknown[]) => [],
    };
  },
};

export async function warmSearchIndex() {
  void db.collection(SEARCH_CHUNKS);
  void db.collection(QUERY_CACHE);
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
