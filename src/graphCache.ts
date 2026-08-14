import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { currentPipelineVersions } from "./compile.js";
import { discoverFiles } from "./extractor.js";
import { relativeFile } from "./graph.js";
import {
  architectureGraphSchema,
  type ArchitectureGraph,
} from "./schema.js";
import { renderArchitectureHtml } from "./viewer.js";

export const CACHE_FINGERPRINT_FILE = "cache-fingerprint.json";
export const ARCHITECTURE_FILE = "architecture.json";
export const VIEWER_FILE = "index.html";

export interface CacheFingerprint {
  filesSignature: string;
  fileCount: number;
  extractors: Record<string, string>;
  adapters: Record<string, string>;
  pipelineVersion: string;
}

function versionMap(
  items: ReadonlyArray<{ id: string; version: string }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of items) out[item.id] = item.version;
  return out;
}

function sameVersionMap(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key, index) =>
      key === rightKeys[index] && left[key] === right[key],
  );
}

export async function computeCacheFingerprint(
  root: string,
): Promise<CacheFingerprint> {
  const files = await discoverFiles(root);
  const parts: string[] = [];
  for (const absolute of files) {
    const info = await stat(absolute);
    parts.push(
      `${relativeFile(root, absolute)}:${info.size}:${Math.trunc(info.mtimeMs)}`,
    );
  }
  const pipeline = currentPipelineVersions();
  return {
    filesSignature: createHash("sha1").update(parts.join("\n")).digest("hex"),
    fileCount: files.length,
    extractors: versionMap(pipeline.extractors),
    adapters: versionMap(pipeline.adapters),
    pipelineVersion: pipeline.pipelineVersion,
  };
}

export function fingerprintsMatch(
  stored: CacheFingerprint,
  current: CacheFingerprint,
): boolean {
  return (
    stored.filesSignature === current.filesSignature &&
    stored.fileCount === current.fileCount &&
    stored.pipelineVersion === current.pipelineVersion &&
    sameVersionMap(stored.extractors, current.extractors) &&
    sameVersionMap(stored.adapters, current.adapters)
  );
}

export function fingerprintPath(outputDir: string): string {
  return path.join(outputDir, CACHE_FINGERPRINT_FILE);
}

export function architecturePath(outputDir: string): string {
  return path.join(outputDir, ARCHITECTURE_FILE);
}

export async function readCacheFingerprint(
  outputDir: string,
): Promise<CacheFingerprint | undefined> {
  try {
    const raw = JSON.parse(
      await readFile(fingerprintPath(outputDir), "utf8"),
    ) as CacheFingerprint;
    if (
      typeof raw.filesSignature !== "string" ||
      typeof raw.fileCount !== "number" ||
      typeof raw.pipelineVersion !== "string" ||
      !raw.extractors ||
      !raw.adapters
    ) {
      return undefined;
    }
    return raw;
  } catch {
    return undefined;
  }
}

export async function isCacheReusable(
  root: string,
  outputDir: string,
): Promise<boolean> {
  const stored = await readCacheFingerprint(outputDir);
  if (!stored) return false;
  const current = await computeCacheFingerprint(root);
  return fingerprintsMatch(stored, current);
}

export async function persistArchitectureGraph(
  outputDir: string,
  graph: ArchitectureGraph,
  root: string = graph.project.root,
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const fingerprint = await computeCacheFingerprint(root);
  await Promise.all([
    writeFile(
      architecturePath(outputDir),
      `${JSON.stringify(graph, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(outputDir, VIEWER_FILE),
      renderArchitectureHtml(graph),
      "utf8",
    ),
    writeFile(
      fingerprintPath(outputDir),
      `${JSON.stringify(fingerprint, null, 2)}\n`,
      "utf8",
    ),
  ]);
}

export async function readArchitectureGraph(
  file: string,
): Promise<ArchitectureGraph> {
  return architectureGraphSchema.parse(
    JSON.parse(await readFile(path.resolve(file), "utf8")),
  );
}
