#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEMP_ROOT"' EXIT

TARGET="$TEMP_ROOT/target"
CACHE="$TEMP_ROOT/cache"
mkdir -p "$TARGET/src"

cat > "$TARGET/package.json" <<'JSON'
{
  "name": "underdelta-bootstrap-smoke",
  "dependencies": {
    "express": "latest"
  }
}
JSON

cat > "$TARGET/src/api.ts" <<'TYPESCRIPT'
import express from "express";
const app = express();
export function health() {}
app.get("/health", health);
TYPESCRIPT

REVISION="$(git -C "$ROOT" rev-parse HEAD)"

run_bootstrap() {
  UNDERDELTA_HOME="$CACHE" \
  UNDERDELTA_REPO="$ROOT" \
  UNDERDELTA_REF="$REVISION" \
    bash "$ROOT/scripts/scan.sh" "$TARGET" --no-serve
}

cold_output="$(run_bootstrap)"
printf '%s\n' "$cold_output"
grep -Fq "Installing dependencies" <<< "$cold_output"
grep -Fq "Building Underdelta" <<< "$cold_output"
grep -Fq "Detected: HTTP API (1)" <<< "$cold_output"
test -s "$TARGET/.underdelta/architecture.json"
test -s "$TARGET/.underdelta/index.html"

warm_output="$(run_bootstrap)"
printf '%s\n' "$warm_output"
grep -Fq "Dependencies current" <<< "$warm_output"
grep -Fq "Build current" <<< "$warm_output"
grep -Fq "Detected: HTTP API (1)" <<< "$warm_output"
