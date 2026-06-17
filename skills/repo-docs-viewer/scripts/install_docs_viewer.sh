#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: install_docs_viewer.sh [--force] [repo-root] [target-relative-dir]

Copies the bundled docs-viewer into a repository.

Arguments:
  repo-root             Target repository root. Defaults to the current directory.
  target-relative-dir   Destination inside the repo. Defaults to tools/docs-viewer.

Options:
  --force               Overwrite existing files when they differ.
USAGE
}

force=0
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi
if [[ "${1:-}" == "--force" ]]; then
  force=1
  shift
fi

repo_root="${1:-$PWD}"
target_rel="${2:-tools/docs-viewer}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill_dir="$(cd "$script_dir/.." && pwd)"
source_dir="$skill_dir/assets/docs-viewer"
target_dir="$repo_root/$target_rel"

if [[ ! -d "$repo_root" ]]; then
  echo "Repo root does not exist: $repo_root" >&2
  exit 1
fi
if [[ ! -d "$source_dir" ]]; then
  echo "Bundled viewer assets are missing: $source_dir" >&2
  exit 1
fi

mkdir -p "$target_dir"

for name in README.md server.mjs viewer.html; do
  src="$source_dir/$name"
  dst="$target_dir/$name"
  if [[ -e "$dst" ]] && ! cmp -s "$src" "$dst" && [[ "$force" -ne 1 ]]; then
    echo "Refusing to overwrite changed file: $dst" >&2
    echo "Re-run with --force if replacement is intended." >&2
    exit 2
  fi
done

cp "$source_dir/README.md" "$target_dir/README.md"
cp "$source_dir/server.mjs" "$target_dir/server.mjs"
cp "$source_dir/viewer.html" "$target_dir/viewer.html"

echo "Installed docs-viewer at: $target_dir"
echo "Run with: DOCS_DIR=\"$repo_root/docs\" PORT=4642 node \"$target_dir/server.mjs\""
