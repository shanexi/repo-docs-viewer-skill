# docs-viewer - local markdown docs site

```bash
node tools/docs-viewer/server.mjs     # http://localhost:4642
```

- Sidebar tree with collapsible directories, current-document highlighting, pinned files/directories, outline navigation, comments, and in-page search.
- One document per URL: `/d/<relative-path>.md`.
- Browser-rendered markdown via unified, remark-parse, remark-gfm, and remark-rehype loaded from esm.sh.
- Obsidian-style image embeds such as `![[Pasted image.png]]`.
- Click-to-zoom image preview with wheel zoom and drag pan.
- Obsidian-style highlights such as `==important text==`.
- Mermaid fenced blocks render with mermaid@11.
- Text comments use RecogitoJS and the W3C Web Annotation model.
- Mermaid diagrams support lightbox zoom/pan and box comments.
- Current-document comments can be copied as Markdown with one click.
- Annotation storage is embedded in a trailing `<!-- docs-viewer:annotations ... -->` markdown comment block, so comments travel with the file and can be tracked by git.
- Environment variables: `DOCS_DIR` defaults to `docs/`; `ASSETS_DIR` defaults to `DOCS_DIR`; `PORT` defaults to `4642`.

For Obsidian vaults, use `DOCS_DIR` for the markdown subfolder you want to browse and `ASSETS_DIR` for the vault root:

```bash
DOCS_DIR=/path/to/vault/topic ASSETS_DIR=/path/to/vault PORT=4642 node tools/docs-viewer/server.mjs
```

This viewer intentionally has no npm install step. Runtime browser dependencies are loaded from CDN.
