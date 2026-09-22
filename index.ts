/// <reference types="bun" />

import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { handleMyInstantsSearch } from "./server.ts";
import {
  brotliCompressSync,
  constants as zlibConstants,
} from "node:zlib";
import * as sanitizeHtmlModule from "sanitize-html";

const sanitizeHtml = sanitizeHtmlModule as unknown as (
  dirty: string,
  options: Record<string, unknown>,
) => string;

type HtmlTransform = (html: string, request: Request) => string;

interface ServerOptions {
  port: number;
  host?: string;
  distDir: string;
  htmlTransform?: HtmlTransform;
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
  fileURLToPath(import.meta.url),
  "../public/",
);

const byodDistDir = join(
  fileURLToPath(import.meta.url),
  "../dist/",
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

const NAVY_API_KEYS = (process.env.NAVY_API_KEY ?? "")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);

let navyKeyIndex = 0;

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

  const cacheKey = `${file}:${transform ? "transform" : "raw"}:${
    transform ? extractHostHeader(req) : ""
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

async function fetchNavyWithRotation(
  body: Record<string, unknown>,
): Promise<Response> {
  if (NAVY_API_KEYS.length === 0) {
    throw new Error(
      "NAVY_API_KEY is not configured",
    );
  }

  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  const startIndex = navyKeyIndex;

  for (
    let attempt = 0;
    attempt < NAVY_API_KEYS.length;
    attempt++
  ) {
    const index =
      (startIndex + attempt) %
      NAVY_API_KEYS.length;

    const apiKey = NAVY_API_KEYS[index];

    try {
      const response = await fetch(
        "https://api.navy/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      if (response.ok) {
        navyKeyIndex = index;

        console.log(
          `[navy] using key ${index + 1}/${NAVY_API_KEYS.length}`,
        );

        return response;
      }

      lastResponse = response;

      console.warn(
        `[navy] key ${index + 1}/${NAVY_API_KEYS.length} failed with HTTP ${response.status}`,
      );
    } catch (error) {
      lastError = error;

      console.warn(
        `[navy] key ${index + 1}/${NAVY_API_KEYS.length} request failed`,
        error,
      );
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(
        "All Navy API keys failed",
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
      /^\/+/,
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

    if (NAVY_API_KEYS.length === 0) {
      return new Response(
        JSON.stringify({
          error:
            "NAVY_API_KEY is not configured",
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

    const upstream =
      await fetchNavyWithRotation({
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

async function handleCloudGaming(
  req: Request,
): Promise<Response> {
  if (
    req.method !== "GET" &&
    req.method !== "POST"
  ) {
    return new Response(null, {
      status: 405,
    });
  }

  try {
    const process = Bun.spawn([
      "python",
      "raccoongame.py",
    ]);

    const outputText =
      await new Response(
        process.stdout,
      ).text();

    const scriptData =
      JSON.parse(
        outputText.trim(),
      );

    if (
      scriptData.success === false
    ) {
      return new Response(
        JSON.stringify({
          error:
            scriptData.error,
        }),
        {
          status: 408,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        },
      );
    }

    return new Response(
      JSON.stringify(
        scriptData,
      ),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
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

  const ssApiKey =
    process.env.SCREENSHARE_API;

  if (!ssApiKey) {
    return new Response(
      JSON.stringify({
        error:
          "Screen share API not configured",
      }),
      {
        status: 503,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      },
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

    const upstream =
      await fetch(
        "https://api.navy/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ssApiKey}`,
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            model,
            messages:
              cleanMessages,
            temperature,
            max_tokens,
          }),
        },
      );

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
  ): Promise<Response> {
    try {
      const requestUrl =
        new URL(req.url);

      const path =
        requestUrl.pathname;

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

      const curlR =
        await tryStaticPrefix(
          req,
          "/curl/",
          libcurlPath,
          path,
        );

      if (curlR) {
        return curlR;
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

      if (
        path === "/api/cloudgaming"
      ) {
        return handleCloudGaming(
          req,
        );
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
    fetch:
      createFetchHandler(options),
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
  distDir: existsSync(
    byodDistDir,
  )
    ? byodDistDir
    : defaultPublicDir,
});