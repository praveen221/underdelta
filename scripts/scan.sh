#!/usr/bin/env bash
# Portable launcher: run Underdelta with no prior install (no npm package).
#
# Map the current project:
#   curl -fsSL https://raw.githubusercontent.com/praveen221/underdelta/master/scripts/scan.sh | bash
#
# Query any project (cwd is the repo being analyzed):
#   curl -fsSL https://raw.githubusercontent.com/praveen221/underdelta/master/scripts/scan.sh | bash -s -- query writes Article
#   curl -fsSL https://raw.githubusercontent.com/praveen221/underdelta/master/scripts/scan.sh | bash -s -- query impact --files src/foo.ts
#   curl -fsSL https://raw.githubusercontent.com/praveen221/underdelta/master/scripts/scan.sh | bash -s -- query unknown
#
# Local copies:
#   bash scan.sh /path/to/repo
#   bash scan.sh . --port 4173
#   bash scan.sh query writes Article
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
ORIG_CWD="$(pwd)"

is_cli_verb() {
  case "${1:-}" in
    scan|query|impact|render) return 0 ;;
    *) return 1 ;;
  esac
}

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
      sed -n '2,19p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      args+=("$1")
      shift
      ;;
  esac
done

CLI_MODE=0
if [[ ${#args[@]} -gt 0 ]] && is_cli_verb "${args[0]}"; then
  CLI_MODE=1
elif [[ ${#args[@]} -gt 0 ]]; then
  TARGET="${args[0]}"
fi

if [[ "$CLI_MODE" -eq 0 ]]; then
  TARGET="$(cd "$TARGET" && pwd)"
fi
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
  git init -q "$TOOL_DIR"
  git -C "$TOOL_DIR" remote add origin "$REPO_URL"
else
  echo "→ Updating Underdelta in $TOOL_DIR"
  git -C "$TOOL_DIR" remote set-url origin "$REPO_URL"
fi
git -C "$TOOL_DIR" fetch -q --depth 1 origin "$REPO_REF"
git -C "$TOOL_DIR" checkout -q FETCH_HEAD

cd "$TOOL_DIR"

lock_hash="$(node -e "const fs=require('node:fs');const crypto=require('node:crypto');process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync('package-lock.json')).digest('hex'))")"
install_key="$(node -v):$lock_hash"
install_stamp="$CACHE_ROOT/install-key"
installed_key=""
if [[ -f "$install_stamp" ]]; then
  installed_key="$(<"$install_stamp")"
fi

if [[ ! -d node_modules || "$installed_key" != "$install_key" ]]; then
  echo "→ Installing dependencies…"
  npm ci --cache "$NPM_CACHE"
  printf '%s\n' "$install_key" > "$install_stamp"
else
  echo "→ Dependencies current"
fi

revision="$(git rev-parse HEAD)"
build_key="$REPO_URL:$revision:$install_key"
build_stamp="$CACHE_ROOT/build-key"
built_key=""
if [[ -f "$build_stamp" ]]; then
  built_key="$(<"$build_stamp")"
fi
if [[ ! -f dist/cli.js || "$built_key" != "$build_key" ]]; then
  echo "→ Building Underdelta…"
  npm run build --silent
  printf '%s\n' "$build_key" > "$build_stamp"
else
  echo "→ Build current"
fi

if [[ "$CLI_MODE" -eq 1 ]]; then
  echo "→ underdelta ${args[*]}"
  cd "$ORIG_CWD"
  exec node "$TOOL_DIR/dist/cli.js" "${args[@]}"
fi

echo "→ Scanning $TARGET"
if [[ "$SERVE" -eq 1 ]]; then
  exec node dist/cli.js scan "$TARGET" --serve "$PORT"
else
  exec node dist/cli.js scan "$TARGET"
  echo
  echo "Open: $TARGET/.underdelta/index.html"
fi
