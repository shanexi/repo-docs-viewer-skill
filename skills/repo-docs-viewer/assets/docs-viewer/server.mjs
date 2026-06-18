#!/usr/bin/env node
// Local docs viewer: markdown, mermaid, and text comments.
// Annotation blocks are embedded at the end of markdown files as invisible HTML comments,
// so comments travel with the file and can be tracked by git.
// Usage: node tools/docs-viewer/server.mjs
//        DOCS_DIR=docs/some-topic node tools/docs-viewer/server.mjs
import { createServer } from "node:http";
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = resolve(process.env.DOCS_DIR ?? join(__dirname, "..", "..", "docs"));
const ASSETS_DIR = resolve(process.env.ASSETS_DIR ?? DOCS_DIR);
const PORT = Number(process.env.PORT ?? 4642);
const STATE_DIR = resolve(process.env.DOCS_VIEWER_STATE_DIR ?? join(homedir(), ".repo-docs-viewer"));
const STATE_FILE = join(STATE_DIR, "state.json");
const IMAGE_MIME = new Map([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function isInside(root, full) {
  return full === root || full.startsWith(root + sep);
}

function safeDocName(raw) {
  let name;
  try {
    name = decodeURIComponent(raw ?? "");
  } catch {
    return null;
  }
  if (!name.endsWith(".md") || name.includes("..") || name.startsWith("/") || name.includes("\0")) return null;
  const full = resolve(DOCS_DIR, name);
  if (!isInside(DOCS_DIR, full)) return null;
  return existsSync(full) && statSync(full).isFile() ? name : null;
}

function isSkippableDir(entryName, relPath) {
  return entryName.startsWith(".") || entryName === "node_modules" || relPath === "tools/docs-viewer";
}

function decodePath(raw) {
  try {
    return decodeURIComponent(raw ?? "");
  } catch {
    return null;
  }
}

function isImagePath(name) {
  return IMAGE_MIME.has(extname(name).toLowerCase());
}

function assetCandidate(full) {
  if (!isInside(ASSETS_DIR, full) && !isInside(DOCS_DIR, full)) return null;
  if (!existsSync(full) || !statSync(full).isFile()) return null;
  return isImagePath(full) ? full : null;
}

function walkAssets(dir = ASSETS_DIR) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relPath = dir === ASSETS_DIR ? entry.name : `${dir.slice(ASSETS_DIR.length + 1)}${sep}${entry.name}`;
    if (entry.isDirectory()) {
      if (!isSkippableDir(entry.name, relPath.split(sep).join("/"))) out.push(...walkAssets(join(dir, entry.name)));
    } else if (isImagePath(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function resolveAssetPath(raw, fromRaw) {
  const name = decodePath(raw);
  if (!name || name.startsWith("/") || name.includes("\0") || !isImagePath(name)) return null;

  const candidates = [];
  const from = decodePath(fromRaw);
  if (from && from.endsWith(".md") && !from.includes("\0") && !from.startsWith("/")) {
    const docFull = resolve(DOCS_DIR, from);
    if (isInside(DOCS_DIR, docFull)) candidates.push(resolve(dirname(docFull), name));
  }
  candidates.push(resolve(ASSETS_DIR, name));

  for (const full of candidates) {
    const found = assetCandidate(full);
    if (found) return found;
  }

  if (!name.includes("/")) {
    const wanted = basename(name);
    return walkAssets()
      .filter((full) => basename(full) === wanted)
      .sort()[0] ?? null;
  }
  return null;
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

function annotationBody(annotation) {
  return (annotation?.body ?? []).map((b) => b?.value).filter(Boolean).join("\n").trim();
}

function visibleAnnotations(annotations) {
  return (annotations ?? []).filter((annotation) => annotationBody(annotation));
}

function writeAnnotations(name, annotations) {
  annotations = visibleAnnotations(annotations);
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
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory() && isSkippableDir(entry.name, relPath)) continue;
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
    return visibleAnnotations(splitDoc(name).annotations).length;
  } catch {
    return 0;
  }
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

function readStateFile() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function safePrefsArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string"
      && item.length > 0
      && item.length < 1000
      && !item.startsWith("/")
      && !item.includes("\0")
      && !item.split("/").includes(".."))
    : [];
}

function readPrefs() {
  const all = readStateFile();
  const prefs = all[DOCS_DIR] ?? {};
  return {
    pins: safePrefsArray(prefs.pins),
    pinOpenDirs: safePrefsArray(prefs.pinOpenDirs),
  };
}

function writePrefs(prefs) {
  const all = readStateFile();
  all[DOCS_DIR] = {
    pins: safePrefsArray(prefs.pins),
    pinOpenDirs: safePrefsArray(prefs.pinOpenDirs),
    updatedAt: new Date().toISOString(),
  };
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(all, null, 2) + "\n");
  return all[DOCS_DIR];
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
  if (path === "/api/prefs") {
    if (req.method === "GET") {
      return send(res, 200, JSON.stringify({ root: DOCS_DIR.split(sep).slice(-1)[0], prefs: readPrefs() }));
    }
    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          send(res, 200, JSON.stringify({ ok: true, prefs: writePrefs(parsed) }));
        } catch (err) {
          send(res, 400, JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }
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
  if (path.startsWith("/asset/")) {
    const full = resolveAssetPath(path.slice(7), url.searchParams.get("from"));
    return full
      ? send(res, 200, readFileSync(full), IMAGE_MIME.get(extname(full).toLowerCase()) ?? "application/octet-stream")
      : send(res, 404, "not found", "text/plain");
  }
  if (path.startsWith("/api/annotations/")) {
    const name = safeDocName(path.slice("/api/annotations/".length));
    if (!name) return send(res, 404, JSON.stringify({ error: "unknown doc" }));
    if (req.method === "GET") {
      const { annotations, updatedAt } = splitDoc(name);
      return send(res, 200, JSON.stringify({ doc: name, updatedAt, annotations: visibleAnnotations(annotations) }));
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
              annotations: visibleAnnotations(current.annotations),
            }));
          }
          const annotations = visibleAnnotations(parsed.annotations);
          const updatedAt = writeAnnotations(name, annotations);
          send(res, 200, JSON.stringify({ ok: true, count: annotations.length, updatedAt }));
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
