# docs-viewer - local markdown docs site

```bash
node tools/docs-viewer/server.mjs     # http://localhost:4642
```

- Sidebar tree with collapsible directories, current-document highlighting, pinned files/directories, outline navigation, comments, and in-page search.
- One document per URL: `/d/<relative-path>.md`.
- Browser-rendered markdown via unified, remark-parse, remark-gfm, and remark-rehype loaded from esm.sh.
- Mermaid fenced blocks render with mermaid@11.
- Text comments use RecogitoJS and the W3C Web Annotation model.
- Mermaid diagrams support lightbox zoom/pan and box comments.
- Annotation storage is embedded in a trailing `<!-- docs-viewer:annotations ... -->` markdown comment block, so comments travel with the file and can be tracked by git.
- Environment variables: `DOCS_DIR` defaults to `docs/`; `PORT` defaults to `4642`.

This viewer intentionally has no npm install step. Runtime browser dependencies are loaded from CDN.
