#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [repository, ...options] = process.argv.slice(2);
if (!repository || repository.startsWith("-")) {
  process.stderr.write("Usage: npm run inspect -- /absolute/path/to/repository [scan options]\n");
  process.exitCode = 1;
} else {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, "dist", "cli.js"), "scan", repository, ...options],
    { stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
}
