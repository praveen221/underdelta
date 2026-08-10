import path from "node:path";
import type { ExtractionContext } from "./extractor.js";
import type { AdapterContribution } from "./graph.js";
import type { ArchitectureEdge, ArchitectureNode } from "./schema.js";

export interface SemanticAdapterContext extends ExtractionContext {
  nodes: readonly ArchitectureNode[];
  edges: readonly ArchitectureEdge[];
}

export interface SemanticAdapter {
  id: string;
  version: string;
  capability: string;
  extensions: ReadonlySet<string>;
  matchesFile?(file: string): boolean;
  extract(context: SemanticAdapterContext): Promise<AdapterContribution>;
}

export async function runSemanticAdapter(
  adapter: SemanticAdapter,
  context: SemanticAdapterContext,
): Promise<AdapterContribution> {
  const files = context.files.filter((file) => {
    if (adapter.extensions.has(path.extname(file).toLowerCase())) return true;
    return adapter.matchesFile?.(file) === true;
  });
  return adapter.extract({ ...context, files });
}
