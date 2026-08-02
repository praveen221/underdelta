import { readdir } from "node:fs/promises";
import path from "node:path";
import type { ExtractorContribution } from "./graph.js";

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".underdelta",
  ".underdelta-verify",
  ".underdelta-real",
  ".venv",
  "__pycache__",
  "build",
  // Release/CI tooling (e.g. swagger-petstore CI/*.py) is not product architecture.
  "CI",
  "coverage",
  "dist",
  "node_modules",
  "site-packages",
  "spec",
  "specs",
  "test",
  "tests",
  "__tests__",
  "fixtures",
  "__fixtures__",
  "verification",
  "vendor",
  "venv",
]);

const ignoredFilePattern = /\.(?:test|spec)\.[^.]+$/i;

export interface ExtractionContext {
  root: string;
  files: string[];
}

export interface ArchitectureExtractor {
  id: string;
  version: string;
  extensions: ReadonlySet<string>;
  extract(context: ExtractionContext): Promise<ExtractorContribution>;
}

export async function discoverFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.isSymbolicLink()) return;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!ignoredDirectories.has(entry.name)) await walk(absolute);
          return;
        }
        if (entry.isFile() && !ignoredFilePattern.test(entry.name)) {
          files.push(absolute);
        }
      }),
    );
  }

  await walk(root);
  return files.sort();
}

export async function runExtractor(
  extractor: ArchitectureExtractor,
  root: string,
  allFiles: string[],
): Promise<ExtractorContribution> {
  const files = allFiles.filter((file) =>
    extractor.extensions.has(path.extname(file).toLowerCase()),
  );
  return extractor.extract({ root, files });
}
