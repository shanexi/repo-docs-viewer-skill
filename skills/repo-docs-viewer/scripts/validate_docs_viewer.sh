#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: validate_docs_viewer.sh [repo-root] [port] [docs-dir] [assets-dir]

Starts the repo docs-viewer on a temporary process and checks core routes.

Arguments:
  repo-root   Repository root. Defaults to the current directory.
  port        Port to bind. Defaults to 4642.
  docs-dir    Markdown docs directory. Defaults to <repo-root>/docs.
  assets-dir  Image attachment directory. Defaults to docs-dir or $ASSETS_DIR.
USAGE
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

repo_root="${1:-$PWD}"
port="${2:-4642}"
docs_dir="${3:-$repo_root/docs}"
assets_dir="${4:-${ASSETS_DIR:-$docs_dir}}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill_dir="$(cd "$script_dir/.." && pwd)"
repo_server="$repo_root/tools/docs-viewer/server.mjs"
bundled_server="$skill_dir/assets/docs-viewer/server.mjs"
if [[ -f "$repo_server" ]]; then
  server="$repo_server"
elif [[ -f "$bundled_server" ]]; then
  server="$bundled_server"
else
  server="$repo_server"
fi
base_url="http://127.0.0.1:$port"

if [[ ! -f "$server" ]]; then
  echo "Missing docs-viewer server: $repo_server or $bundled_server" >&2
  exit 1
fi
if [[ ! -d "$docs_dir" ]]; then
  echo "Docs directory does not exist: $docs_dir" >&2
  exit 1
fi
if [[ ! -d "$assets_dir" ]]; then
  echo "Assets directory does not exist: $assets_dir" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "node is required but was not found on PATH." >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required but was not found on PATH." >&2
  exit 1
fi

node --check "$server" >/dev/null

sample_md="$(find "$docs_dir" -type f -name '*.md' | sort | head -n 1 || true)"
if [[ -z "$sample_md" ]]; then
  echo "No markdown files found under: $docs_dir" >&2
  exit 1
fi
sample_rel="${sample_md#"$docs_dir"/}"
sample_url="$(node -e 'console.log(process.argv[1].split("/").map(encodeURIComponent).join("/"))' "$sample_rel")"

log_file="$(mktemp /tmp/repo-docs-viewer.XXXXXX.log)"
state_dir="$(mktemp -d /tmp/repo-docs-viewer-state.XXXXXX)"
DOCS_VIEWER_STATE_DIR="$state_dir" DOCS_DIR="$docs_dir" ASSETS_DIR="$assets_dir" PORT="$port" node "$server" >"$log_file" 2>&1 &
server_pid=$!
cleanup() {
  kill "$server_pid" >/dev/null 2>&1 || true
  wait "$server_pid" >/dev/null 2>&1 || true
  rm -f "$log_file"
  rm -rf "$state_dir"
}
trap cleanup EXIT

for _ in $(seq 1 40); do
  if curl -fsS "$base_url/" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$server_pid" >/dev/null 2>&1; then
    echo "docs-viewer exited early. Server log:" >&2
    sed -n '1,120p' "$log_file" >&2
    exit 1
  fi
  sleep 0.25
done

curl -fsS "$base_url/" >/dev/null
curl -fsS "$base_url/api/tree" >/dev/null
curl -fsS "$base_url/api/prefs" >/dev/null
curl -fsS --path-as-is "$base_url/raw/$sample_url" >/dev/null

traversal_code="$(curl -sS -o /dev/null -w '%{http_code}' --path-as-is "$base_url/raw/%2e%2e/package.json" || true)"
if [[ "$traversal_code" == "200" ]]; then
  echo "Path traversal check failed: encoded traversal returned 200." >&2
  exit 1
fi

echo "docs-viewer validation passed."
echo "Base URL: $base_url"
echo "Sample raw markdown: /raw/$sample_url"
echo "Server: $server"
