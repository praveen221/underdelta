#!/usr/bin/env bash
# One-command Underdelta from a checkout of this repo.
#
# Usage:
#   ./scripts/run.sh                      # scan this repo, serve + open
#   ./scripts/run.sh /path/to/other/repo  # scan another repo
#   ./scripts/run.sh /path/to/repo --no-serve
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="."
SERVE=1
PORT="${UNDERDELTA_PORT:-4173}"
NPM_CACHE="${UNDERDELTA_NPM_CACHE:-$HOME/.npm-cache-underdelta}"

args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-serve|--no-open)
      SERVE=0
      shift
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --port=*)
      PORT="${1#*=}"
      shift
      ;;
    -h|--help)
      sed -n '2,10p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      args+=("$1")
      shift
      ;;
  esac
done

if [[ ${#args[@]} -gt 0 ]]; then
  TARGET="${args[0]}"
fi

TARGET="$(cd "$TARGET" && pwd)"

cd "$ROOT"

if [[ ! -d node_modules ]]; then
  echo "→ Installing dependencies…"
  npm ci --cache "$NPM_CACHE"
fi

echo "→ Building Underdelta…"
npm run build --silent

echo "→ Scanning $TARGET"
if [[ "$SERVE" -eq 1 ]]; then
  exec node dist/cli.js scan "$TARGET" --serve "$PORT"
else
  exec node dist/cli.js scan "$TARGET"
fi
