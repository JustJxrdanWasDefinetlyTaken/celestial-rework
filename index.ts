// <reference types="bun" />

import { epoxyPath } from "@mercuryworkshop/epoxy-transport";

import libcurlPath from "@mercuryworkshop/libcurl-transport";

import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

import { existsSync } from "node:fs";

import { stat } from "node:fs/promises";

import { fileURLToPath } from "node:url";

import { dirname, extname, join } from "node:path";

import { scrapeListing } from "myinstants-scraper";

import {

  brotliCompressSync,

  constants as zlibConstants,

} from "node:zlib";

import sanitizeHtml from "sanitize-html";
import { handleAiRequest } from "./index_ai.ts";
import {
  handleCgRequest,
  handleAstraProxy
} from "./cg.ts";


type HtmlTransform = (html: string, request: Request) => string;

interface ServerOptions {

  port: number;

  host?: string;

  distDir: string;

  htmlTransform?: HtmlTransform;

}

type AstraSocketData = {
  upstream: WebSocket | null;
  upstreamUrl: string;
  headers: Record<string, string>;
  queue: (string | Uint8Array)[];
  closed: boolean;
};

function astraSocketHeaders(req: Request): Record<string, string> {
  const url = new URL(req.url);
  const headers: Record<string, string> = {};

  const authorization = req.headers.get("authorization");
  const cookie = req.headers.get("cookie");
  const userAgent = req.headers.get("user-agent");

  if (authorization) {
    headers["Authorization"] = authorization;
  }

  if (cookie) {
    headers["Cookie"] = cookie;
  }

  if (userAgent) {
    headers["User-Agent"] = userAgent;
  }

  headers["Origin"] = "https://astra-education.top";
  headers["X-Forwarded-Host"] = url.host;
  headers["X-Forwarded-Proto"] = url.protocol.replace(":", "");
  headers["X-Forwarded-Prefix"] = "/astra";

  return headers;
}

interface HtmlEntry {

  mtime: number;

  raw: Buffer;

  br: Buffer;

}

interface ChatBody {

  model: string;

  messages: {

    role: string;

    content: string | any[];

  }[];

  temperature?: number;

  max_tokens?: number;

}

interface RateLimitEntry {

  count: number;

  reset: number;

}

const defaultPublicDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "public",
);

const byodDistDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "dist",
);

const corsHeaders = {

  "Access-Control-Allow-Origin": "*",

};

const CHAT_RATE_LIMIT_MAX = 200;

const CHAT_RATE_LIMIT_WINDOW_MS = 3 * 60 * 60 * 1000;

const SS_RATE_LIMIT_MAX = 200;

const SS_RATE_LIMIT_WINDOW_MS = 3 * 60 * 60 * 1000;

const MUSIC_API = "https://musicthing.space/api/";

const MUSIC_AUTH = "Bearer galactic";

const htmlCache = new Map<string, HtmlEntry>();

const ipLimits = new Map<string, RateLimitEntry>();

const ssIpLimits = new Map<string, RateLimitEntry>();

function extractHostHeader(request: Request): string | null {

  const raw =

    request.headers.get("x-forwarded-host") ??

    request.headers.get("host");

  const first = raw?.split(",")[0]?.trim();

  if (!first) {

    return null;

  }

  return first.replace(/:\d+$/, "").toLowerCase();

}

async function loadHtml(

  req: Request,

  file: string,

  transform?: HtmlTransform,

): Promise<HtmlEntry | null> {

  let s;

  try {

    s = await stat(file);

  } catch {

    return null;

  }

  if (!s.isFile()) {

    return null;

  }

  const cacheKey = `${file}:${transform ? "transform" : "raw"}:${transform ? extractHostHeader(req) : ""

    }`;

  const cached = htmlCache.get(cacheKey);

  if (cached && cached.mtime === s.mtimeMs) {

    return cached;

  }

  try {

    const html = await Bun.file(file).text();

    const injected = transform

      ? transform(html, req)

      : html;

    const raw = Buffer.from(injected, "utf8");

    const br = brotliCompressSync(raw, {

      params: {

        [zlibConstants.BROTLI_PARAM_QUALITY]: 5,

      },

    });

    const entry: HtmlEntry = {

      mtime: s.mtimeMs,

      raw,

      br,

    };

    htmlCache.set(cacheKey, entry);

    return entry;

  } catch {

    return null;

  }

}

function htmlResponse(

  entry: HtmlEntry,

  acceptEncoding: string,

  status = 200,

): Response {

  const useBr = acceptEncoding.includes("br");

  const body = useBr ? entry.br : entry.raw;

  const responseBody = new ArrayBuffer(body.byteLength);

  new Uint8Array(responseBody).set(body);

  const headers: Record<string, string> = {

    "Content-Type": "text/html; charset=utf-8",

    "Cache-Control": "no-cache",

    "Content-Length": body.byteLength.toString(),

    Vary: "Accept-Encoding",

  };

  if (useBr) {

    headers["Content-Encoding"] = "br";

  }

  return new Response(responseBody, {

    status,

    headers,

  });

}

function htmlCandidates(

  rootDir: string,

  urlPath: string,

): string[] {

  const decoded = decodeURIComponent(

    urlPath.split("?")[0] ?? "",

  );

  if (decoded.includes("..")) {

    return [];

  }

  if (decoded.endsWith("/")) {

    return [

      join(rootDir, decoded, "index.html"),

    ];

  }

  if (decoded.endsWith(".html")) {

    return [join(rootDir, decoded)];

  }

  return [

    join(rootDir, decoded, "index.html"),

    join(rootDir, `${decoded}.html`),

  ];

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

  ".flac": "audio/flac",

  ".mp4": "video/mp4",

  ".webm": "video/webm",

  ".ogg": "audio/ogg",

  ".wav": "audio/wav",

  ".m4a": "audio/mp4",

  ".txt": "text/plain; charset=utf-8",

  ".xml": "application/xml",

  ".pdf": "application/pdf",

  ".data": "application/octet-stream",

};

function mimeFor(file: string): string {

  if (file.endsWith(".br")) {

    const inner = file.slice(0, -3);

    return (

      MIME[extname(inner).toLowerCase()] ??

      "application/octet-stream"

    );

  }

  return (

    MIME[extname(file).toLowerCase()] ??

    "application/octet-stream"

  );

}

async function serveFile(

  req: Request,

  filePath: string,

): Promise<Response | null> {

  let s;

  try {

    s = await stat(filePath);

  } catch {

    return null;

  }

  if (!s.isFile()) {

    return null;

  }

  const etag = `W/"${s.size.toString(

    16,

  )}-${Math.floor(s.mtimeMs).toString(16)}"`;

  if (req.headers.get("if-none-match") === etag) {

    return new Response(null, {

      status: 304,

    });

  }

  const headers: Record<string, string> = {

    ETag: etag,

    "Last-Modified": s.mtime.toUTCString(),

    "Content-Length": s.size.toString(),

    "Content-Type": mimeFor(filePath),

    "Cache-Control": "public, max-age=3600",

  };

  if (filePath.endsWith(".br")) {

    headers["Content-Encoding"] = "br";

  }

  if (req.method === "HEAD") {

    return new Response(null, {

      headers,

    });

  }

  return new Response(Bun.file(filePath), {

    headers,

  });

}

async function tryStaticPrefix(

  req: Request,

  prefix: string,

  baseDir: string,

  urlPath: string,

): Promise<Response | null> {

  if (!urlPath.startsWith(prefix)) {

    return null;

  }

  const sub = urlPath.slice(prefix.length);

  const decoded = decodeURIComponent(

    sub.split("?")[0] ?? "",

  );

  if (decoded.includes("..")) {

    return new Response(null, {

      status: 400,

    });

  }

  return (

    (await serveFile(

      req,

      join(baseDir, decoded),

    )) ??

    new Response(null, {

      status: 404,

    })

  );

}

function checkRateLimit(

  store: Map<string, RateLimitEntry>,

  ip: string,

  max: number,

  windowMs: number,

):

  | { limited: true; retryAfterSec: number }

  | { limited: false } {

  const now = Date.now();

  const entry = store.get(ip);

  if (entry && now < entry.reset) {

    if (entry.count >= max) {

      return {

        limited: true,

        retryAfterSec: Math.ceil(

          (entry.reset - now) / 1000,

        ),

      };

    }

    entry.count++;

    return {

      limited: false,

    };

  }

  store.set(ip, {

    count: 1,

    reset: now + windowMs,

  });

  return {

    limited: false,

  };

}

function rateLimitedResponse(

  retryAfterSec: number,

): Response {

  return new Response(

    JSON.stringify({

      error: "Limit reached",

      retryAfter: retryAfterSec,

    }),

    {

      status: 429,

      headers: {

        ...corsHeaders,

        "Content-Type": "application/json",

        "Retry-After": String(retryAfterSec),

      },

    },

  );

}

async function handleMusicRequest(

  req: Request,

): Promise<Response | null> {

  const url = new URL(req.url);

  if (

    url.pathname !== "/api/music" &&

    !url.pathname.startsWith("/api/music/")

  ) {

    return null;

  }

  if (

    req.method !== "GET" &&

    req.method !== "HEAD" &&

    req.method !== "POST"

  ) {

    return new Response(null, {

      status: 405,

      headers: corsHeaders,

    });

  }

  const upstreamPath = url.pathname.slice(

    "/api/music".length,

  );

  if (

    !upstreamPath ||

    upstreamPath === "/"

  ) {

    return new Response(

      JSON.stringify({

        error: "Music endpoint required",

      }),

      {

        status: 400,

        headers: {

          ...corsHeaders,

          "Content-Type": "application/json",

        },

      },

    );

  }

  const upstreamUrl = new URL(

    `${MUSIC_API}${upstreamPath.replace(

      /^\/+|\/+$/g,

      "",

    )}`,

  );

  url.searchParams.forEach((value, key) => {

    upstreamUrl.searchParams.append(

      key,

      value,

    );

  });

  const headers = new Headers();

  headers.set(

    "Authorization",

    MUSIC_AUTH,

  );

  const contentType =

    req.headers.get("content-type");

  if (contentType) {

    headers.set(

      "Content-Type",

      contentType,

    );

  }

  const range = req.headers.get("range");

  if (range) {

    headers.set("Range", range);

  }

  const accept = req.headers.get("accept");

  if (accept) {

    headers.set("Accept", accept);

  }

  try {

    const upstream = await fetch(

      upstreamUrl.toString(),

      {

        method: req.method,

        headers,

        body:

          req.method === "POST"

            ? await req.arrayBuffer()

            : undefined,

      },

    );

    const responseHeaders =

      new Headers();

    for (const [key, value] of upstream.headers) {

      if (

        key.toLowerCase() !==

        "access-control-allow-origin" &&

        key.toLowerCase() !==

        "content-encoding"

      ) {

        responseHeaders.set(

          key,

          value,

        );

      }

    }

    responseHeaders.set(

      "Access-Control-Allow-Origin",

      "*",

    );

    responseHeaders.set(

      "Access-Control-Allow-Methods",

      "GET, HEAD, POST, OPTIONS",

    );

    responseHeaders.set(

      "Access-Control-Allow-Headers",

      "Content-Type, Authorization, Range",

    );

    return new Response(

      req.method === "HEAD"

        ? null

        : upstream.body,

      {

        status: upstream.status,

        statusText: upstream.statusText,

        headers: responseHeaders,

      },

    );

  } catch (error) {

    return new Response(

      JSON.stringify({

        error:

          error instanceof Error

            ? error.message

            : String(error),

      }),

      {

        status: 502,

        headers: {

          ...corsHeaders,

          "Content-Type":

            "application/json",

        },

      },

    );

  }

}

async function handleChat(

  req: Request,

): Promise<Response> {

  if (req.method === "OPTIONS") {

    return new Response(null, {

      status: 204,

      headers: {

        ...corsHeaders,

        "Access-Control-Allow-Methods":

          "POST, OPTIONS",

        "Access-Control-Allow-Headers":

          "Content-Type",

      },

    });

  }

  if (req.method !== "POST") {

    return new Response(null, {

      status: 405,

      headers: corsHeaders,

    });

  }

  const ip =

    req.headers

      .get("x-forwarded-for")

      ?.split(",")[0]

      ?.trim()

    ?? "unknown";

  const rl = checkRateLimit(

    ipLimits,

    ip,

    CHAT_RATE_LIMIT_MAX,

    CHAT_RATE_LIMIT_WINDOW_MS,

  );

  if (rl.limited) {

    return rateLimitedResponse(

      rl.retryAfterSec,

    );

  }

  try {

    const body =

      (await req.json()) as ChatBody;

    const {

      model,

      messages,

      temperature = 0.8,

      max_tokens = 1024,

    } = body;

    if (

      !model ||

      !Array.isArray(messages)

    ) {

      return new Response(

        JSON.stringify({

          error:

            "Invalid request body",

        }),

        {

          status: 400,

          headers: {

            ...corsHeaders,

            "Content-Type":

              "application/json",

          },

        },

      );

    }

    const cleanMessages =

      messages.map((m) => ({

        role: sanitizeHtml(

          m.role,

          {

            allowedTags: [],

            allowedAttributes: {},

          },

        ),

        content:

          Array.isArray(m.content)

            ? m.content

            : sanitizeHtml(

              m.content,

              {

                allowedTags: [],

                allowedAttributes: {},

              },

            ),

      }));
    const upstream = await handleAiRequest({
      model,
      messages: cleanMessages,
      temperature,
      max_tokens,
    });

    const text =

      await upstream.text();

    return new Response(text, {

      status: upstream.status,

      headers: {

        ...corsHeaders,

        "Content-Type":

          upstream.headers.get(

            "content-type",

          ) ??

          "application/json",

      },

    });

  } catch (err) {

    return new Response(

      JSON.stringify({

        error:

          err instanceof Error

            ? err.message

            : String(err),

      }),

      {

        status: 500,

        headers: {

          ...corsHeaders,

          "Content-Type":

            "application/json",

        },

      },

    );

  }

}

async function handleScreenShare(

  req: Request,

): Promise<Response> {

  if (req.method === "OPTIONS") {

    return new Response(null, {

      status: 204,

      headers: {

        ...corsHeaders,

        "Access-Control-Allow-Methods":

          "POST, OPTIONS",

        "Access-Control-Allow-Headers":

          "Content-Type",

      },

    });

  }

  if (req.method !== "POST") {

    return new Response(null, {

      status: 405,

      headers: corsHeaders,

    });

  }

  const ip =

    req.headers

      .get("x-forwarded-for")

      ?.split(",")[0]

      ?.trim()

    ?? "unknown";

  const rl = checkRateLimit(

    ssIpLimits,

    ip,

    SS_RATE_LIMIT_MAX,

    SS_RATE_LIMIT_WINDOW_MS,

  );

  if (rl.limited) {

    return rateLimitedResponse(

      rl.retryAfterSec,

    );

  }

  try {

    const body =

      (await req.json()) as ChatBody;

    const {

      model,

      messages,

      temperature = 0.8,

      max_tokens = 1024,

    } = body;

    if (

      !model ||

      !Array.isArray(messages)

    ) {

      return new Response(

        JSON.stringify({

          error:

            "Invalid request body",

        }),

        {

          status: 400,

          headers: {

            ...corsHeaders,

            "Content-Type":

              "application/json",

          },

        },

      );

    }

    const cleanMessages =

      messages.map((m) => ({

        role: sanitizeHtml(

          m.role,

          {

            allowedTags: [],

            allowedAttributes: {},

          },

        ),

        content:

          Array.isArray(m.content)

            ? m.content

            : sanitizeHtml(

              m.content,

              {

                allowedTags: [],

                allowedAttributes: {},

              },

            ),

      }));

    const upstream = await handleAiRequest({
      model,
      messages: cleanMessages,
      temperature,
      max_tokens,
    });

    const text =

      await upstream.text();

    return new Response(text, {

      status: upstream.status,

      headers: {

        ...corsHeaders,

        "Content-Type":

          upstream.headers.get(

            "content-type",

          ) ??

          "application/json",

      },

    });

  } catch (err) {

    return new Response(

      JSON.stringify({

        error:

          err instanceof Error

            ? err.message

            : String(err),

      }),

      {

        status: 500,

        headers: {

          ...corsHeaders,

          "Content-Type":

            "application/json",

        },

      },

    );

  }

}

async function handleMyInstantsSearch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const query = url.searchParams.get("q")?.trim();

  if (!query) {
    return Response.json({ error: "Missing search query" }, { status: 400 });
  }

  try {
    const searchUrl = `https://www.myinstants.com/en/search/?name=${encodeURIComponent(query)}`;
    const results = await scrapeListing(
      searchUrl,
      { maxPages: 1 },
      { delayMs: 1000 },
    );
    return Response.json(results);
  } catch (error) {
    console.error("MyInstants search failed:", error);
    return Response.json(
      {
        error: "MyInstants search failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

async function handleNotFound(

  req: Request,

  rootDir: string,

  acceptEncoding: string,

  transform?: HtmlTransform,

): Promise<Response> {

  const entry = await loadHtml(

    req,

    join(rootDir, "404.html"),

    transform,

  );

  if (entry) {

    return htmlResponse(

      entry,

      acceptEncoding,

      404,

    );

  }

  return new Response(

    "Not found",

    {

      status: 404,

    },

  );

}

function createFetchHandler(

  options: ServerOptions,

) {

  const rootDir =

    options.distDir;

  const htmlTransform =

    options.htmlTransform;

  return async function fetch(
    req: Request,
    server: Bun.Server<AstraSocketData>,
  ):
    Promise<Response | undefined> {

    try {

      const requestUrl =

        new URL(req.url);

      const path =

        requestUrl.pathname;

      if (
        path === "/astra/live-lesson" &&
        req.headers.get("upgrade")?.toLowerCase() === "websocket"
      ) {
        const upstreamUrl =
          "wss://astra-education.top/live-lesson" +
          requestUrl.search;

        const upgraded = server.upgrade(req, {
          data: {
            upstream: null,
            upstreamUrl,
            headers: astraSocketHeaders(req),
            queue: [],
            closed: false,
          },
        });

        if (upgraded) {
          return undefined;
        }

        return new Response("websocket upgrade failed", {
          status: 400,
        });
      }

      const acceptEncoding =

        req.headers.get(

          "accept-encoding",

        ) ?? "";

      const muxR =

        await tryStaticPrefix(

          req,

          "/mux/",

          baremuxPath,

          path,

        );

      if (muxR) {

        return muxR;

      }

      const epoxyR =

        await tryStaticPrefix(

          req,

          "/epoxy/",

          epoxyPath,

          path,

        );

      if (epoxyR) {

        return epoxyR;

      }

      if (

        path === "/api/music" ||

        path.startsWith("/api/music/")

      ) {

        return handleMusicRequest(

          req,

        ) as Promise<Response>;

      }

      if (path === "/api/chat") {

        return handleChat(req);

      }

      if (path === "/api/cg") {
        return handleCgRequest(req);
      }

      if (path.startsWith("/astra/")) {
        return handleAstraProxy(req);
      }

      if (

        path === "/api/screenshare"

      ) {

        return handleScreenShare(

          req,

        );

      }

      if (

        path === "/api/search"

      ) {

        return handleMyInstantsSearch(req);

      }

      if (path === "/ads.txt") {

        return new Response(

          "Not Found",

          {

            status: 404,

            headers: {

              "Cache-Control":

                "no-store",

            },

          },

        );

      }

      if (

        req.method !== "GET" &&

        req.method !== "HEAD"

      ) {

        return new Response(null, {

          status: 405,

        });

      }

      const accept =

        req.headers.get("accept") ??

        "";

      const looksLikeHtml =

        accept.includes(

          "text/html",

        ) ||

        path === "/" ||

        path.endsWith(".html") ||

        path.endsWith("/");

      if (looksLikeHtml) {

        for (const candidate of htmlCandidates(

          rootDir,

          path,

        )) {

          const entry =

            await loadHtml(

              req,

              candidate,

              htmlTransform,

            );

          if (entry) {

            return htmlResponse(

              entry,

              acceptEncoding,

            );

          }

        }

      }

      const decoded =

        decodeURIComponent(path);

      if (decoded.includes("..")) {

        return new Response(null, {

          status: 400,

        });

      }

      const fileR =

        await serveFile(

          req,

          join(

            rootDir,

            decoded,

          ),

        );

      if (fileR) {

        return fileR;

      }

      return handleNotFound(

        req,

        rootDir,

        acceptEncoding,

        htmlTransform,

      );

    } catch (err) {

      console.error(err);

      return new Response(

        "Internal Server Error",

        {

          status: 500,

        },

      );

    }

  };

}

function parsePort(

  envName: string,

  defaultPort: number,

): number {

  const raw =

    process.env[envName];

  if (!raw) {

    return defaultPort;

  }

  const parsed =

    Number.parseInt(raw, 10);

  return Number.isFinite(parsed) &&

    parsed > 0

    ? parsed

    : defaultPort;

}

function parseHost(

  envName: string,

): string | undefined {

  const raw =

    process.env[envName]?.trim();

  return raw || undefined;

}

function startServer(

  options: ServerOptions,

): void {

const server = Bun.serve({
  hostname: options.host,
  port: options.port,
  fetch: createFetchHandler(options),

  websocket: {
    data: {} as AstraSocketData,

    open(ws) {
      let upstream: WebSocket;

      try {
        upstream = new WebSocket(
          ws.data.upstreamUrl,
          {
            headers: ws.data.headers,
            perMessageDeflate: false,
          },
        );
      } catch (error) {
        console.error(
          "astra websocket creation error:",
          error,
        );

        try {
          ws.close(1011, "astra connection error");
        } catch {}

        return;
      }

      ws.data.upstream = upstream;
      upstream.binaryType = "arraybuffer";

      upstream.addEventListener("open", () => {
        console.log(
          "astra upstream websocket connected",
        );

        for (const message of ws.data.queue) {
          if (
            upstream.readyState !==
            WebSocket.OPEN
          ) {
            break;
          }

          try {
            if (typeof message === "string") {
              upstream.send(message);
            } else {
              const copy = new Uint8Array(
                message.byteLength,
              );

              copy.set(message);
              upstream.send(copy);
            }
          } catch (error) {
            console.error(
              "astra websocket queue error:",
              error,
            );
          }
        }

        ws.data.queue = [];
      });

      upstream.addEventListener(
        "message",
        (event) => {
          if (ws.data.closed) {
            return;
          }

          try {
            if (
              typeof event.data === "string"
            ) {
              ws.send(event.data);
              return;
            }

            if (
              event.data instanceof ArrayBuffer
            ) {
              ws.send(event.data);
              return;
            }

            if (
              ArrayBuffer.isView(event.data)
            ) {
              const view = new Uint8Array(
                event.data.buffer,
                event.data.byteOffset,
                event.data.byteLength,
              );

              const copy = new Uint8Array(
                view.byteLength,
              );

              copy.set(view);
              ws.send(copy);
              return;
            }

            if (event.data instanceof Blob) {
              event.data
                .arrayBuffer()
                .then((data) => {
                  if (ws.data.closed) {
                    return;
                  }

                  try {
                    ws.send(data);
                  } catch (error) {
                    console.error(
                      "astra client send error:",
                      error,
                    );
                  }
                })
                .catch((error) => {
                  console.error(
                    "astra blob error:",
                    error,
                  );
                });
            }
          } catch (error) {
            console.error(
              "astra websocket message error:",
              error,
            );
          }
        },
      );

      upstream.addEventListener(
        "error",
        (error) => {
          console.error(
            "astra websocket error:",
            error,
          );

          if (ws.data.closed) {
            return;
          }

          ws.data.closed = true;

          try {
            ws.close(
              1011,
              "astra connection error",
            );
          } catch (error) {
            console.error(
              "astra client close error:",
              error,
            );
          }
        },
      );

      upstream.addEventListener(
        "close",
        (event) => {
          console.log(
            "astra upstream websocket closed:",
            event.code,
            event.reason,
          );

          if (ws.data.closed) {
            return;
          }

          ws.data.closed = true;

          const validCode =
            event.code === 1000 ||
            (
              event.code >= 1001 &&
              event.code <= 1014 &&
              event.code !== 1004 &&
              event.code !== 1005 &&
              event.code !== 1006
            ) ||
            (
              event.code >= 3000 &&
              event.code <= 4999
            );

          try {
            if (validCode) {
              ws.close(
                event.code,
                event.reason ||
                  "upstream closed",
              );
            } else {
              ws.close(
                1011,
                event.reason ||
                  "upstream closed",
              );
            }
          } catch (error) {
            console.error(
              "astra upstream close error:",
              error,
            );
          }
        },
      );
    },

    message(ws, message) {
      try {
        const upstream =
          ws.data.upstream;

        if (
          upstream &&
          upstream.readyState ===
            WebSocket.OPEN
        ) {
          if (typeof message === "string") {
            upstream.send(message);
          } else {
            const copy = new Uint8Array(
              message.byteLength,
            );

            copy.set(message);
            upstream.send(copy);
          }

          return;
        }

        if (typeof message === "string") {
          ws.data.queue.push(message);
        } else {
          const copy = new Uint8Array(
            message.byteLength,
          );

          copy.set(message);
          ws.data.queue.push(copy);
        }
      } catch (error) {
        console.error(
          "astra client message error:",
          error,
        );
      }
    },

    close(ws, code, reason) {
      ws.data.closed = true;

      const upstream =
        ws.data.upstream;

      if (
        upstream &&
        (
          upstream.readyState ===
            WebSocket.OPEN ||
          upstream.readyState ===
            WebSocket.CONNECTING
        )
      ) {
        try {
          const validCode =
            code === 1000 ||
            (
              code >= 1001 &&
              code <= 1014 &&
              code !== 1004 &&
              code !== 1005 &&
              code !== 1006
            ) ||
            (
              code >= 3000 &&
              code <= 4999
            );

          if (validCode) {
            upstream.close(
              code,
              reason || undefined,
            );
          } else {
            upstream.close();
          }
        } catch (error) {
          console.error(
            "astra websocket close error:",
            error,
          );
        }
      }

      ws.data.queue = [];
    },

    idleTimeout: 0,
    maxPayloadLength:
      16 * 1024 * 1024,
    perMessageDeflate: false,
  },

  idleTimeout: 180,
});

  console.log(

    `[byod] running on port ${server.port}`,

  );

  console.log(

    `[byod] http://localhost:${server.port}`,

  );

}

startServer({

  host: parseHost(

    "CELESTIAL_BYOD_HOST",

  ),

  port: parsePort(

    "CELESTIAL_BYOD_PORT",

    parsePort("PORT", 5439),

  ),

  distDir: defaultPublicDir,

});