---
name: repo-docs-viewer
description: Install, validate, and use a portable zero-build markdown documentation viewer for any repository. Use when Codex needs to turn a repo's markdown docs into a local browsable site, add the docs-viewer asset to another repo, review or annotate docs with embedded markdown comments, validate docs-viewer behavior, or create date-stamped discussion docs under docs/.
---

# Repo Docs Viewer

## Overview

Use this skill to add or operate a local markdown docs viewer in any repository. The viewer asset is bundled in `assets/docs-viewer/` and is designed to be copied into a repo at `tools/docs-viewer/`.

The viewer serves markdown files from a docs directory with a sidebar tree, browser-rendered markdown and mermaid, text annotations, mermaid box comments, outline navigation, in-page search, and embedded annotation storage in the markdown file.

## Workflow

1. Confirm the target repo root. If the user does not specify one, use the current working directory only if it is clearly the intended repo.
2. If `tools/docs-viewer/server.mjs` and `tools/docs-viewer/viewer.html` are missing, install the bundled viewer:

```bash
/Users/shane/.codex/skills/repo-docs-viewer/scripts/install_docs_viewer.sh <repo-root>
```

3. If the repo already has a viewer, do not overwrite it unless the user asks. Run validation instead.
4. Start or validate the viewer with an explicit docs directory when the repo does not use `docs/`:

```bash
DOCS_DIR=<repo-root>/docs PORT=4642 node <repo-root>/tools/docs-viewer/server.mjs
/Users/shane/.codex/skills/repo-docs-viewer/scripts/validate_docs_viewer.sh <repo-root> 4642 <repo-root>/docs
```

5. Share the local URL with the user. Use `/d/<relative-path>.md` for a specific document.

## Installing Into Another Repo

Run the installer from anywhere:

```bash
/Users/shane/.codex/skills/repo-docs-viewer/scripts/install_docs_viewer.sh /path/to/repo
```

The installer copies:

- `assets/docs-viewer/README.md`
- `assets/docs-viewer/server.mjs`
- `assets/docs-viewer/viewer.html`

Default destination: `<repo-root>/tools/docs-viewer/`.

Use `--force` only when the user explicitly wants to replace the existing viewer files:

```bash
/Users/shane/.codex/skills/repo-docs-viewer/scripts/install_docs_viewer.sh --force /path/to/repo
```

## Validation

Prefer the validation script after installation or before recommending adoption:

```bash
/Users/shane/.codex/skills/repo-docs-viewer/scripts/validate_docs_viewer.sh /path/to/repo 4642 /path/to/repo/docs
```

The script checks:

- `node --check tools/docs-viewer/server.mjs`
- `GET /`
- `GET /api/tree`
- `GET /raw/<sample-md>`
- encoded path traversal returns non-200

If the server fails under a background launch, run it in the foreground to capture startup errors before debugging the browser.

## Discussion Docs

When the user asks for a discussion artifact, create a synthesized markdown document rather than a source dump. Prefer date-stamped paths such as:

```text
docs/<owner-or-topic>-MMDD/<topic>-discussion.md
```

After creating a document, validate that it appears in `/api/tree` and open it at:

```text
http://localhost:<port>/d/<relative-path>.md
```

## Annotation Model

The viewer stores annotations inside the markdown file in a trailing HTML comment block. Treat those blocks as intentional repo content:

- They are invisible in rendered markdown.
- They should be preserved unless the user asks to clear comments.
- They can be committed, so annotation history follows normal git history.
- Concurrent writes use the annotation block `updatedAt` baseline; a stale write returns `409`.

When resolving comments, read and modify the markdown file directly if needed. Avoid sidecar annotation files unless a repo has deliberately forked the viewer.

## Portability Notes

- Do not assume any specific repository; accept any markdown docs tree.
- Use `DOCS_DIR` for repos whose docs live outside `docs/`.
- Use a different `PORT` when the default is busy.
- The viewer has no npm install step; browser dependencies load from CDN.
