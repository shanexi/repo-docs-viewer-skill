#!/usr/bin/env node
// Local docs viewer: markdown, mermaid, and text comments.
// Annotation blocks are embedded at the end of markdown files as invisible HTML comments,
// so comments travel with the file and can be tracked by git.
// Usage: node tools/docs-viewer/server.mjs
//        DOCS_DIR=docs/some-topic node tools/docs-viewer/server.mjs
import { createServer } from "node:http";
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = resolve(process.env.DOCS_DIR ?? join(__dirname, "..", "..", "docs"));
const PORT = Number(process.env.PORT ?? 4642);

function safeDocName(raw) {
  let name;
  try {
    name = decodeURIComponent(raw ?? "");
  } catch {
    return null;
  }
  if (!name.endsWith(".md") || name.includes("..") || name.startsWith("/") || name.includes("\0")) return null;
  const full = resolve(DOCS_DIR, name);
  if (!full.startsWith(DOCS_DIR + sep)) return null;
  return existsSync(full) && statSync(full).isFile() ? name : null;
}

const ANNO_BLOCK_RE = /\n?<!-- docs-viewer:annotations\n([\s\S]*?)\n-->\s*$/;

function splitDoc(name) {
  const raw = readFileSync(join(DOCS_DIR, name), "utf8");
  const match = raw.match(ANNO_BLOCK_RE);
  if (!match) return { body: raw, annotations: [], updatedAt: null };
  try {
    const parsed = JSON.parse(match[1]);
    return { body: raw.slice(0, match.index), annotations: parsed.annotations ?? [], updatedAt: parsed.updatedAt ?? null };
  } catch {
    return { body: raw.slice(0, match.index), annotations: [], updatedAt: null };
  }
}

function writeAnnotations(name, annotations) {
  const { body } = splitDoc(name);
  const updatedAt = new Date().toISOString();
  // JSON 内出现 --> 会终结 HTML 注释；转义为等价的 \u003e 序列（JSON.parse 透明还原）
  const json = JSON.stringify({ updatedAt, annotations }, null, 2)
    .replaceAll("-->", "--\\u003e");
  const block = annotations.length
    ? `${body.replace(/\s*$/, "\n")}\n<!-- docs-viewer:annotations\n${json}\n-->\n`
    : body;
  writeFileSync(join(DOCS_DIR, name), block);
  // 空列表时整个注释块被移除，下次读到的 updatedAt 是 null——返回的基准必须跟着归 null
  return annotations.length ? updatedAt : null;
}

function walkDocs(dir = DOCS_DIR, rel = "") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...walkDocs(join(dir, entry.name), relPath));
    } else if (entry.name.endsWith(".md")) {
      out.push(relPath);
    }
  }
  return out;
}

function annotationCount(name) {
  try {
    return splitDoc(name).annotations.length;
  } catch {
    return 0;
  }
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

function treeJson() {
  return walkDocs().sort().map((path) => ({
    path,
    count: annotationCount(path),
    mtime: statSync(join(DOCS_DIR, path)).mtime.toISOString().slice(0, 16).replace("T", " "),
  }));
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path === "/" || path === "") {
    return send(res, 200, readFileSync(join(__dirname, "viewer.html"), "utf8"), "text/html; charset=utf-8");
  }
  if (path === "/api/tree") {
    return send(res, 200, JSON.stringify({ root: DOCS_DIR.split(sep).slice(-1)[0], docs: treeJson() }));
  }
  if (path.startsWith("/d/")) {
    return safeDocName(path.slice(3))
      ? send(res, 200, readFileSync(join(__dirname, "viewer.html"), "utf8"), "text/html; charset=utf-8")
      : send(res, 404, "not found", "text/plain");
  }
  if (path.startsWith("/raw/")) {
    const name = safeDocName(path.slice(5));
    return name
      ? send(res, 200, splitDoc(name).body, "text/markdown; charset=utf-8")
      : send(res, 404, "not found", "text/plain");
  }
  if (path.startsWith("/api/annotations/")) {
    const name = safeDocName(path.slice("/api/annotations/".length));
    if (!name) return send(res, 404, JSON.stringify({ error: "unknown doc" }));
    if (req.method === "GET") {
      const { annotations, updatedAt } = splitDoc(name);
      return send(res, 200, JSON.stringify({ doc: name, updatedAt, annotations }));
    }
    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          if (!Array.isArray(parsed.annotations)) throw new Error("annotations must be an array");
          // Optimistic concurrency: persist rewrites the whole annotation list, so
          // a stale tab must not overwrite external edits. A mismatched baseline
          // updatedAt returns 409 with the latest state.
          const current = splitDoc(name);
          if ((parsed.baseUpdatedAt ?? null) !== current.updatedAt) {
            return send(res, 409, JSON.stringify({
              error: "conflict",
              updatedAt: current.updatedAt,
              annotations: current.annotations,
            }));
          }
          const updatedAt = writeAnnotations(name, parsed.annotations);
          send(res, 200, JSON.stringify({ ok: true, count: parsed.annotations.length, updatedAt }));
        } catch (err) {
          send(res, 400, JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }
  }
  send(res, 404, "not found", "text/plain");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`docs-viewer: http://localhost:${PORT}  (docs: ${DOCS_DIR})`);
});
