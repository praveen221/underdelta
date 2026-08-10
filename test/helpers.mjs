import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { discoverFiles, runExtractor } from "../dist/extractor.js";
import { runSemanticAdapter } from "../dist/adapter.js";
import { GraphBuilder } from "../dist/graph.js";

async function withFiles(prefix, files, run) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    await Promise.all(
      Object.entries(files).map(async ([relative, source]) => {
        const target = path.join(root, relative);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, source, "utf8");
      }),
    );
    return await run(root, await discoverFiles(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function extract(extractor, files) {
  return withFiles("underdelta-extractor-", files, (root, discovered) =>
    runExtractor(extractor, root, discovered));
}

export async function adapt(adapter, extractors, files) {
  return withFiles("underdelta-adapter-", files, async (root, discovered) => {
    const builder = new GraphBuilder();
    for (const extractor of extractors) {
      builder.add(await runExtractor(extractor, root, discovered));
    }
    const snapshot = builder.snapshot();
    return runSemanticAdapter(adapter, {
      root,
      files: discovered,
      nodes: snapshot.nodes,
      edges: snapshot.edges,
    });
  });
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
