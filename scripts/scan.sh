#!/usr/bin/env bash
# Portable one-liner: scan any repository with Underdelta (no prior install).
#
# From any project:
#   curl -fsSL https://raw.githubusercontent.com/praveen221/underdelta/master/scripts/scan.sh | bash
#
# Or with an explicit target / options:
#   bash scan.sh /path/to/repo
#   bash scan.sh . --port 4173
#   UNDERDELTA_HOME=~/src/underdelta bash scan.sh .
#
# First run clones + builds Underdelta into a cache dir; later runs reuse it.
#
set -euo pipefail

REPO_URL="${UNDERDELTA_REPO:-https://github.com/praveen221/underdelta.git}"
REPO_REF="${UNDERDELTA_REF:-master}"
CACHE_ROOT="${UNDERDELTA_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}/underdelta}"
NPM_CACHE="${UNDERDELTA_NPM_CACHE:-$HOME/.npm-cache-underdelta}"
PORT="${UNDERDELTA_PORT:-4173}"
TARGET="."
SERVE=1

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
      sed -n '2,16p' "$0" | sed 's/^# \?//'
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
TOOL_DIR="$CACHE_ROOT/src"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: '$1' is required" >&2
    exit 1
  }
}

need_cmd git
need_cmd npm
need_cmd node

node_major="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$node_major" -lt 22 ]]; then
  echo "error: Node.js >= 22 required (found $(node -v))" >&2
  exit 1
fi

mkdir -p "$CACHE_ROOT"

if [[ ! -d "$TOOL_DIR/.git" ]]; then
  echo "→ Cloning Underdelta ($REPO_REF) into $TOOL_DIR"
  git clone --depth 1 --branch "$REPO_REF" "$REPO_URL" "$TOOL_DIR"
else
  echo "→ Updating Underdelta in $TOOL_DIR"
  git -C "$TOOL_DIR" fetch --depth 1 origin "$REPO_REF"
  git -C "$TOOL_DIR" checkout -q FETCH_HEAD
fi

cd "$TOOL_DIR"

if [[ ! -d node_modules ]]; then
  echo "→ Installing dependencies…"
  npm ci --cache "$NPM_CACHE"
else
  # Refresh lockstep installs cheaply when package-lock changes.
  if [[ package-lock.json -nt node_modules ]]; then
    echo "→ Refreshing dependencies…"
    npm ci --cache "$NPM_CACHE"
  fi
fi

echo "→ Building Underdelta…"
npm run build --silent

echo "→ Scanning $TARGET"
if [[ "$SERVE" -eq 1 ]]; then
  exec node dist/cli.js scan "$TARGET" --serve "$PORT"
else
  exec node dist/cli.js scan "$TARGET"
  echo
  echo "Open: $TARGET/.underdelta/index.html"
fi
