import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { discoverFiles } from "../dist/extractor.js";
import {
  isUnderdeltaToolingRepo,
  parseReadmeHeadingHints,
  parseReadmeTitle,
} from "../dist/project.js";

test("README parsing keeps a real product title and ignores setup-code headings", () => {
  const readme = [
    '<h1 align="center">TrackNotch</h1>',
    "",
    "## Setup",
    "```bash",
    "# Install Claude Code if you haven't already",
    "npm install -g @anthropic-ai/claude-code",
    "```",
    "",
    "## API",
    "Notes API lives in `src/server.ts`.",
    "",
  ].join("\n");
  assert.equal(parseReadmeTitle(readme), "TrackNotch");
  assert.deepEqual(parseReadmeHeadingHints(readme), []);
});

test("Underdelta self-map projection is not activated by familiar filenames", () => {
  assert.equal(
    isUnderdeltaToolingRepo({ packageManifest: { name: "decoy-tooling" } }),
    false,
  );
  assert.equal(
    isUnderdeltaToolingRepo({ packageManifest: { name: "underdelta" } }),
    true,
  );
});

test("repository discovery excludes test, verification, and cache inputs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "underdelta-discovery-"));
  try {
    await Promise.all([
      writeFile(path.join(root, "src.ts"), "export {};\n"),
      mkdir(path.join(root, "verification"), { recursive: true }),
      mkdir(path.join(root, "tests"), { recursive: true }),
      mkdir(path.join(root, ".underdelta-real"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(root, "verification", "fake.ts"), "export {};\n"),
      writeFile(path.join(root, "tests", "example.ts"), "export {};\n"),
      writeFile(path.join(root, ".underdelta-real", "cached.ts"), "export {};\n"),
      writeFile(path.join(root, "src.test.ts"), "export {};\n"),
    ]);
    const files = await discoverFiles(root);
    assert.deepEqual(files.map((file) => path.basename(file)), ["src.ts"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
