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
