/**
 * Mongoose models for the mini-mongo fixture.
 * Underdelta extracts mongoose.model(...) and Schema collection options.
 */

type SchemaOptions = { collection?: string };

class Schema {
  constructor(
    _definition: Record<string, unknown>,
    public options: SchemaOptions = {},
  ) {}
}

const mongoose = {
  Schema,
  model(name: string, _schema: Schema) {
    return {
      modelName: name,
      find: async () => [],
      create: async (doc: unknown) => doc,
      aggregate: async (_pipeline: unknown[]) => [],
    };
  },
};

const noteSchema = new mongoose.Schema(
  {
    title: String,
    body: String,
    author: { type: "ObjectId", ref: "User" },
  },
  { collection: "notes" },
);

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
});

const tagSchema = new mongoose.Schema(
  { name: String },
  { collection: "tags" },
);

export const Note = mongoose.model("Note", noteSchema);
export const User = mongoose.model("User", userSchema);
export const Tag = mongoose.model("Tag", tagSchema);
