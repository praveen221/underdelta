import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { discoverFiles, runExtractor } from "../dist/extractor.js";

export async function extract(extractor, files) {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-extractor-"));
  try {
    await Promise.all(
      Object.entries(files).map(async ([relative, source]) => {
        const target = path.join(root, relative);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, source, "utf8");
      }),
    );
    const discovered = await discoverFiles(root);
    return await runExtractor(extractor, root, discovered);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export function nodeBy(contribution, kind, label) {
  const node = contribution.nodes.find(
    (candidate) => candidate.kind === kind && candidate.label === label,
  );
  assert.ok(node, `expected ${kind}:${label}`);
  return node;
}

export function edgeBy(contribution, kind, source, target) {
  const edge = contribution.edges.find(
    (candidate) =>
      candidate.kind === kind &&
      candidate.source === source &&
      candidate.target === target,
  );
  assert.ok(edge, `expected ${kind} edge ${source} -> ${target}`);
  return edge;
}

export function assertObserved(node, file, line) {
  const evidence = node.evidence.find((item) => item.file === file);
  assert.ok(evidence, `expected evidence in ${file}`);
  assert.equal(evidence.certainty, "observed");
  if (line !== undefined) assert.equal(evidence.range?.startLine, line);
}
