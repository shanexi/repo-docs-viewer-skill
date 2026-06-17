# Repo Docs Viewer Skill

[![skills.sh](https://skills.sh/b/shanexi/repo-docs-viewer-skill)](https://skills.sh/shanexi/repo-docs-viewer-skill)

Turn a repo's markdown docs into a local preview site your coding agent can install, validate, and open.

## Quick Start

Install the skill:

```bash
npx skills add shanexi/repo-docs-viewer-skill --skill repo-docs-viewer
```

Then ask your agent:

```text
Use $repo-docs-viewer to install and preview docs for this repo.
```

The agent will copy the zero-build viewer into `tools/docs-viewer/`, validate the routes, start the local server, and open the preview when Codex Desktop, Claude Code Desktop, or another browser surface is available.

## Preview

Docs tree:

![Docs tree](assets/docs-tree.png)

Rendered markdown:

![Markdown preview](assets/markdown-preview.png)

## Manual Fallback

```bash
skills/repo-docs-viewer/scripts/install_docs_viewer.sh /path/to/repo
skills/repo-docs-viewer/scripts/validate_docs_viewer.sh /path/to/repo 4642 /path/to/repo/docs
DOCS_DIR=/path/to/repo/docs PORT=4642 node /path/to/repo/tools/docs-viewer/server.mjs
```

Open:

```text
http://localhost:4642
```

## What It Supports

- Sidebar tree for markdown files
- Browser-rendered markdown and Mermaid
- Embedded markdown annotations that can be tracked by git
- Desktop preview flow for Codex Desktop and Claude Code Desktop
