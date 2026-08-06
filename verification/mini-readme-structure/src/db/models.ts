/**
 * Mongoose models for the mini-readme-structure fixture (Heart twin).
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
    };
  },
};

const noteSchema = new mongoose.Schema(
  {
    title: String,
    body: String,
  },
  { collection: "notes" },
);

export const Note = mongoose.model("Note", noteSchema);
