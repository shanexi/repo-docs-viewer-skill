# Repo Docs Viewer Skill

[![skills.sh](https://skills.sh/b/shanexi/repo-docs-viewer-skill)](https://skills.sh/shanexi/repo-docs-viewer-skill)

Install, validate, and use a portable zero-build markdown documentation viewer for any repository.

## Install

```bash
npx skills add shanexi/repo-docs-viewer-skill --skill repo-docs-viewer
```
## What it gives your agent

- A reusable workflow for adding a local markdown docs viewer to a repo.
- Bundled viewer assets that copy into `tools/docs-viewer/`.
- Validation scripts for the viewer server, docs tree API, raw markdown route, and path traversal guard.
- Guidance to open the viewer in Codex Desktop, Claude Code Desktop, or another local preview/browser surface when available.
- Guidance for creating date-stamped discussion docs and preserving embedded markdown annotations.

## Direct Script Usage

After installing the skill, an agent can copy the viewer into a target repo:

```bash
skills/repo-docs-viewer/scripts/install_docs_viewer.sh /path/to/repo
```

Then validate it:

```bash
skills/repo-docs-viewer/scripts/validate_docs_viewer.sh /path/to/repo 4642 /path/to/repo/docs
```

The viewer itself runs without an npm install step:

```bash
DOCS_DIR=/path/to/repo/docs PORT=4642 node /path/to/repo/tools/docs-viewer/server.mjs
```

## Skill Layout

```text
skills/repo-docs-viewer/
├── SKILL.md
├── agents/openai.yaml
├── assets/docs-viewer/
└── scripts/
```
