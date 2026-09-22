import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import sanitizeHtml from "sanitize-html";

logging.set_level(logging.NONE);

const publicDir = join(fileURLToPath(import.meta.url), "../public/");

interface HtmlEntry {
  mtime: number;
  raw: Buffer;
  br: Buffer;
}

const htmlCache = new Map<string, HtmlEntry>();

async function loadInjectedHtml(file: string): Promise<HtmlEntry | null> {
  let s;
  try {
    s = await stat(file);
  } catch {
    return null;
  }
  if (!s.isFile()) return null;
  const cached = htmlCache.get(file);
  if (cached && cached.mtime === s.mtimeMs) return cached;
  try {
    const html = await readFile(file, "utf8");
    const raw = Buffer.from(html, "utf8");
    const br = brotliCompressSync(raw, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
    });
    const entry: HtmlEntry = { mtime: s.mtimeMs, raw, br };
    htmlCache.set(file, entry);
    return entry;
  } catch {
    return null;
  }
}

function writeHtml(
  res: ServerResponse,
  entry: HtmlEntry,
  acceptEncoding: string,
  status = 200,
): void {
  const useBr = acceptEncoding.includes("br");
  const body = useBr ? entry.br : entry.raw;
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Vary", "Accept-Encoding");
  res.setHeader("Content-Length", body.byteLength.toString());
  if (useBr) res.setHeader("Content-Encoding", "br");
  res.end(body);
}

function htmlCandidates(urlPath: string): string[] {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  if (decoded.includes("..")) return [];
  if (decoded.endsWith("/")) return [join(publicDir, decoded, "index.html")];
  if (decoded.endsWith(".html")) return [join(publicDir, decoded)];
  return [join(publicDir, decoded, "index.html"), join(publicDir, `${decoded}.html`)];
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "audio/ogg",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".data": "application/octet-stream",
};

function mimeFor(file: string): string {
  if (file.endsWith(".br")) {
    const inner = file.slice(0, -3);
    return MIME[extname(inner).toLowerCase()] ?? "application/octet-stream";
  }
  return MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
}

async function serveFile(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
): Promise<boolean> {
  let s;
  try {
    s = await stat(filePath);
  } catch {
    return false;
  }
  if (!s.isFile()) return false;

  const etag = `W/"${s.size.toString(16)}-${Math.floor(s.mtimeMs).toString(16)}"`;
  if (req.headers["if-none-match"] === etag) {
    res.statusCode = 304;
    res.end();
    return true;
  }
  res.setHeader("ETag", etag);
  res.setHeader("Last-Modified", s.mtime.toUTCString());
  res.setHeader("Content-Length", s.size.toString());
  res.setHeader("Content-Type", mimeFor(filePath));
  if (filePath.endsWith(".br")) res.setHeader("Content-Encoding", "br");
  res.setHeader("Cache-Control", "public, max-age=3600");
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  createReadStream(filePath).pipe(res);
  return true;
}

async function tryStaticPrefix(
  req: IncomingMessage,
  res: ServerResponse,
  prefix: string,
  baseDir: string,
  urlPath: string,
): Promise<boolean> {
  if (!urlPath.startsWith(prefix)) return false;
  const sub = urlPath.slice(prefix.length);
  const decoded = decodeURIComponent(sub.split("?")[0]);
  if (decoded.includes("..")) {
    res.statusCode = 400;
    res.end();
    return true;
  }
  const ok = await serveFile(req, res, join(baseDir, decoded));
  if (!ok) {
    res.statusCode = 404;
    res.end();
  }
  return true;
}

interface ChatBody {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
}

async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end();
    return;
  }
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as ChatBody;
    const { model, messages, temperature = 0.8, max_tokens = 1024 } = body;

    const cleanMessages = messages.map((m) => ({
      role: sanitizeHtml(m.role, { allowedTags: [], allowedAttributes: {} }),
      content: sanitizeHtml(m.content, { allowedTags: [], allowedAttributes: {} }),
    }));

    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages: cleanMessages, temperature, max_tokens }),
    });
    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader("Content-Type", "application/json");
    res.end(text);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: (err as Error).message }));
  }
}

async function handleNotFound(res: ServerResponse, acceptEncoding: string): Promise<void> {
  const entry = await loadInjectedHtml(join(publicDir, "404.html"));
  if (entry !== null) {
    writeHtml(res, entry, acceptEncoding, 404);
  } else {
    res.statusCode = 404;
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = req.url ?? "/";
    const path = url.split("?")[0];

    if (await tryStaticPrefix(req, res, "/mux/", baremuxPath, path)) return;
    if (await tryStaticPrefix(req, res, "/epoxy/", epoxyPath, path)) return;
    if (await tryStaticPrefix(req, res, "/curl/", libcurlPath, path)) return;
    if (await tryStaticPrefix(req, res, "/scram/", scramjetPath, path)) return;

    if (path === "/api/chat") return handleChat(req, res);

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      res.end();
      return;
    }

    const accept = req.headers.accept ?? "";
    const looksLikeHtml =
      accept.includes("text/html") ||
      path === "/" ||
      path.endsWith(".html") ||
      path.endsWith("/");
    if (looksLikeHtml) {
      const acceptEncoding = req.headers["accept-encoding"];
      const ae = typeof acceptEncoding === "string" ? acceptEncoding : "";
      for (const candidate of htmlCandidates(path)) {
        const entry = await loadInjectedHtml(candidate);
        if (entry !== null) {
          writeHtml(res, entry, ae);
          return;
        }
      }
    }

    const decoded = decodeURIComponent(path);
    if (decoded.includes("..")) {
      res.statusCode = 400;
      res.end();
      return;
    }
    if (await serveFile(req, res, join(publicDir, decoded))) return;

    const ae = req.headers["accept-encoding"];
    await handleNotFound(res, typeof ae === "string" ? ae : "");
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  }
});

server.on("upgrade", (req, socket, head) => {
  if (req.url?.endsWith("/wisp/")) {
    wisp.routeRequest(req, socket, head);
  } else {
    socket.end();
  }
});

server.listen(5439, () => {
  console.log("running on port 5439");
  console.log("http://localhost:5439");
});