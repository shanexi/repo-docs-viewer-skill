---
name: repo-docs-viewer
description: Install, validate, preview, and use a portable zero-build markdown documentation viewer for any repository. Use when Codex needs to turn a repo's markdown docs into a local browsable site, open docs in a Codex Desktop or Claude Code preview/browser surface, add the docs-viewer asset to another repo, review or annotate docs with embedded markdown comments, validate docs-viewer behavior, or create date-stamped discussion docs under docs/.
---

# Repo Docs Viewer

## Overview

Use this skill to add or operate a local markdown docs viewer in any repository. The viewer asset is bundled in `assets/docs-viewer/` and is designed to be copied into a repo at `tools/docs-viewer/`.

The viewer serves markdown files from a docs directory with a sidebar tree, browser-rendered markdown, Obsidian image embeds, click-to-zoom image preview, Obsidian `==highlights==`, mermaid, text annotations, mermaid box comments, one-click Markdown copy for current-document comments, outline navigation, in-page search, and embedded annotation storage in the markdown file.

## Workflow

1. Confirm the target repo root. If the user does not specify one, use the current working directory only if it is clearly the intended repo.
2. Choose the operating mode:
   - For preview-only use, especially in an Obsidian vault or a non-git directory, run the bundled viewer directly and do not copy `tools/docs-viewer/`.
   - For repo adoption where the viewer should be committed and reused by the project, install the bundled viewer into `tools/docs-viewer/`.
3. Preview-only command:

```bash
DOCS_DIR=<docs-dir> ASSETS_DIR=<asset-root> PORT=4642 node assets/docs-viewer/server.mjs
```

4. If `tools/docs-viewer/server.mjs` and `tools/docs-viewer/viewer.html` are missing and repo adoption is intended, install the bundled viewer:

```bash
scripts/install_docs_viewer.sh <repo-root>
```

5. If the repo already has a viewer, do not overwrite it unless the user asks. Run validation instead.
6. Start or validate the viewer with an explicit docs directory when the repo does not use `docs/`:

```bash
DOCS_DIR=<repo-root>/docs ASSETS_DIR=<repo-root> PORT=4642 node <repo-root>/tools/docs-viewer/server.mjs
scripts/validate_docs_viewer.sh <repo-root> 4642 <repo-root>/docs <repo-root>
```

7. In Codex Desktop, Claude Code Desktop, or any agent environment with a preview/browser surface, open the viewer URL directly and confirm the page renders. If no preview surface is available, share the local URL with the user. Use `/d/<relative-path>.md` for a specific document.

## Installing Into Another Repo

Run the installer from anywhere:

```bash
scripts/install_docs_viewer.sh /path/to/repo
```

The installer copies:

- `assets/docs-viewer/README.md`
- `assets/docs-viewer/server.mjs`
- `assets/docs-viewer/viewer.html`

Default destination: `<repo-root>/tools/docs-viewer/`.

Use `--force` only when the user explicitly wants to replace the existing viewer files:

```bash
scripts/install_docs_viewer.sh --force /path/to/repo
```

## Validation

Prefer the validation script after installation or before recommending adoption:

```bash
scripts/validate_docs_viewer.sh /path/to/repo 4642 /path/to/repo/docs /path/to/repo
```

The script checks:

- `node --check tools/docs-viewer/server.mjs`
- `GET /`
- `GET /api/tree`
- `GET /raw/<sample-md>`
- encoded path traversal returns non-200

If `tools/docs-viewer/` is not installed, the script falls back to this skill's bundled `assets/docs-viewer/server.mjs`.

If the server fails under a background launch, run it in the foreground to capture startup errors before debugging the browser.

## Desktop Preview

When a desktop agent can open local URLs, treat preview as part of completion:

- Open `http://localhost:<port>/` after the server starts.
- Open at least one markdown document at `/d/<relative-path>.md`, especially the document the user asked about.
- Wait briefly for browser-side markdown, mermaid, and annotation scripts to settle before deciding the page is blank or broken.
- If preview tooling is unavailable, state that limitation and give the exact URL instead.

## Discussion Docs

When the user asks for a discussion artifact, create a synthesized markdown document rather than a source dump. Prefer date-stamped paths such as:

```text
docs/<owner-or-topic>-MMDD/<topic>-discussion.md
```

After creating a document, validate that it appears in `/api/tree` and open it at:

```text
http://localhost:<port>/d/<relative-path>.md
```

### Document style preferences

When creating or editing docs, especially while addressing comments, prefer Mermaid diagrams for content that describes flows, steps, state transitions, routing, scheduling, or system interactions. Keep prose for conclusions and tradeoffs, but use `mermaid` blocks to make process-oriented parts inspectable in the viewer.

## Annotation Model

The viewer stores annotations inside the markdown file in a trailing HTML comment block. Treat those blocks as intentional repo content:

- They are invisible in rendered markdown.
- They should be preserved unless the user asks to clear comments.
- They can be committed, so annotation history follows normal git history.
- Concurrent writes use the annotation block `updatedAt` baseline; a stale write returns `409`.

Avoid sidecar annotation files unless a repo has deliberately forked the viewer.

### Reading annotation blocks

When an agent needs to inspect comments from disk, read the trailing block:

```text
<!-- docs-viewer:annotations
{ ...json... }
-->
```

This is the same export contract as the viewer's Comments tab copy button: quote/excerpt plus comment body, formatted for Markdown. The UI copy button is the human-facing shortcut; the following parsing rules are the disk/API version agents should use. The JSON is W3C Web Annotation shaped. Do not look for top-level `quote`, `anchor`, or `text` fields first. The selected text is stored under `target.selector`:

- Text comments: `target.selector[] | type == "TextQuoteSelector" | exact`
- Text offsets: `target.selector[] | type == "TextPositionSelector" | start/end`
- Mermaid box comments: `target.selector[] | type == "MermaidBoxSelector" | extractedText`
- Comment body: join `body[].value` where `body[].purpose == "commenting"` or where `value` is present

Use this helper shape when dumping annotations:

```python
import json, re

def selectors_of(a):
    sel = (a.get("target") or {}).get("selector", [])
    return sel if isinstance(sel, list) else [sel]

def quote_of(a):
    for s in selectors_of(a):
        if s.get("type") == "TextQuoteSelector":
            return s.get("exact", "")
        if s.get("type") == "MermaidBoxSelector":
            return s.get("extractedText", "")
    return ""

def body_of(a):
    return "\n".join(
        b.get("value", "")
        for b in (a.get("body") or [])
        if isinstance(b, dict) and b.get("value")
    )

text = open("path/to/doc.md", encoding="utf-8").read()
match = re.search(r"<!-- docs-viewer:annotations\n(.*?)\n-->\s*$", text, re.S)
data = json.loads(match.group(1)) if match else {"annotations": []}
for annotation in data.get("annotations", []):
    print("QUOTE:", quote_of(annotation) or "(no anchor text)")
    print("COMMENT:", body_of(annotation))
```

### Resolving review comments

A comment is **review feedback on the document**, not a chat message to answer in place. When the user says a doc "has comments" / asks you to handle, address, or resolve them, follow exactly these three steps — in order — for each comment:

1. **Read** the comment's `value` and what its selector anchors to in the body.
2. **Act in the document body**: edit the prose at (or near) the anchor — revise stale/incorrect content, answer the question by making the doc say the answer, delete what the comment flags as wrong. The edit *is* your response. If the comment is process feedback about your workflow rather than the doc's content, do the corresponding work elsewhere (e.g. update a skill or config) and do **not** record that exchange in the doc.
3. **Clear** the resolved annotation from the trailing block (drop that annotation object; remove the whole block once all are resolved).

**Never write a reply *into* the annotation block.** Do not add a `body` item, append to the comment's `value`, or create a "↳ reply" annotation. The viewer renders an annotation by joining every `body[].value` with newlines, so a reply there just corrupts the original comment text. There is no reply UI — the loop is **edit the doc, then clear the comment**, never "answer the comment object." (This is the single most common mistake: treating comments as a conversation thread instead of as edits-to-make.)

## Portability Notes

- Do not assume any specific repository; accept any markdown docs tree.
- Use `DOCS_DIR` for repos whose docs live outside `docs/`.
- Use `ASSETS_DIR` when markdown uses Obsidian-style image embeds and attachments live outside `DOCS_DIR`, such as a vault root containing images for a subfolder.
- Use a different `PORT` when the default is busy.
- The viewer has no npm install step; browser dependencies load from CDN.
