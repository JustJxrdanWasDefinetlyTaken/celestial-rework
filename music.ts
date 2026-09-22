// music.ts

const MUSIC_API_BASE = "https://musicthing.space/api";
const MUSIC_API_TOKEN = "galactic";

const MUSIC_HEADERS = {
  Authorization: `Bearer ${MUSIC_API_TOKEN}`,
  Accept: "application/json",
};

let currentSource = "youtube";

function json(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function errorResponse(
  message: string,
  status = 500,
): Response {
  return json(
    {
      error: message,
    },
    status,
  );
}

function getQueryParam(
  url: URL,
  name: string,
): string | null {
  const value = url.searchParams.get(name);

  if (!value) return null;

  return value.trim() || null;
}

function buildUpstreamUrl(
  path: string,
  searchParams?: URLSearchParams,
): string {
  const url = new URL(
    `${MUSIC_API_BASE}${path}`,
  );

  if (searchParams) {
    for (const [key, value] of searchParams.entries()) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

async function proxyResponse(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...MUSIC_HEADERS,
      ...(options.headers ?? {}),
    },
  });

  const headers = new Headers();

  const contentType =
    response.headers.get("content-type");

  if (contentType) {
    headers.set(
      "Content-Type",
      contentType,
    );
  }

  const contentLength =
    response.headers.get("content-length");

  if (contentLength) {
    headers.set(
      "Content-Length",
      contentLength,
    );
  }

  const cacheControl =
    response.headers.get("cache-control");

  if (cacheControl) {
    headers.set(
      "Cache-Control",
      cacheControl,
    );
  } else {
    headers.set(
      "Cache-Control",
      "no-store",
    );
  }

  const contentRange =
    response.headers.get("content-range");

  if (contentRange) {
    headers.set(
      "Content-Range",
      contentRange,
    );
  }

  const acceptRanges =
    response.headers.get("accept-ranges");

  if (acceptRanges) {
    headers.set(
      "Accept-Ranges",
      acceptRanges,
    );
  }

  const etag =
    response.headers.get("etag");

  if (etag) {
    headers.set("ETag", etag);
  }

  return new Response(
    response.body,
    {
      status: response.status,
      headers,
    },
  );
}

/**
 * Normalize the musicthing.space search response
 * into the format used by the frontend.
 */
function normalizeSearchResult(
  item: any,
) {
  const artist =
    Array.isArray(item.artists)
      ? item.artists
          .map((artist: any) => artist?.name)
          .filter(Boolean)
          .join(", ")
      : "";

  const artwork =
    Array.isArray(item.thumbnails) &&
    item.thumbnails.length
      ? item.thumbnails[
          item.thumbnails.length - 1
        ]?.url
      : "";

  return {
    id: item.videoId,
    source: "youtube",

    title:
      item.title ||
      "Unknown title",

    artist:
      artist ||
      "Unknown artist",

    album:
      item.album?.name ||
      item.album?.title ||
      "",

    duration:
      Number(item.duration_seconds) ||
      0,

    durationText:
      item.duration ||
      "",

    artwork,

    thumbnails:
      item.thumbnails || [],

    videoType:
      item.videoType || null,

    resultType:
      item.resultType || null,

    category:
      item.category || null,

    lossless:
      item.lossless || null,

    artistId:
      item.artists?.[0]?.id ||
      null,

    raw: item,
  };
}

async function handleSearch(
  req: Request,
): Promise<Response> {
  if (req.method !== "GET") {
    return errorResponse(
      "Method not allowed",
      405,
    );
  }

  const url = new URL(req.url);

  const query =
    getQueryParam(url, "q") ??
    getQueryParam(url, "query");

  if (!query) {
    return json(
      {
        items: [],
        query: "",
        source: currentSource,
      },
    );
  }

  const params = new URLSearchParams();

  params.set("q", query);

  /*
   * musicthing.space currently handles
   * the actual YouTube music search.
   *
   * Limit is kept client-side because the
   * upstream endpoint returns its own result set.
   */

  try {
    const response =
      await fetch(
        buildUpstreamUrl(
          "/search",
          params,
        ),
        {
          headers: MUSIC_HEADERS,
        },
      );

    const text =
      await response.text();

    if (!response.ok) {
      return new Response(
        text || JSON.stringify({
          error: "Music search failed",
        }),
        {
          status: response.status,
          headers: {
            "Content-Type":
              response.headers.get(
                "content-type",
              ) ??
              "application/json",
          },
        },
      );
    }

    let data: unknown;

    try {
      data = JSON.parse(text);
    } catch {
      return errorResponse(
        "Music API returned invalid JSON",
        502,
      );
    }

    const results =
      Array.isArray(data)
        ? data
        : Array.isArray(
            (data as any)?.results,
          )
          ? (data as any).results
          : [];

    return json({
      items:
        results
          .filter(
            (item: any) =>
              item &&
              item.videoId,
          )
          .map(
            normalizeSearchResult,
          ),

      query,

      source: "youtube",
    });
  } catch (error) {
    console.error(
      "Music search error:",
      error,
    );

    return errorResponse(
      error instanceof Error
        ? error.message
        : "Unable to search music",
      502,
    );
  }
}

async function handleSong(
  req: Request,
  id: string,
): Promise<Response> {
  if (req.method !== "GET") {
    return errorResponse(
      "Method not allowed",
      405,
    );
  }

  if (!id) {
    return errorResponse(
      "Missing song ID",
      400,
    );
  }

  try {
    return await proxyResponse(
      buildUpstreamUrl(
        `/song/${encodeURIComponent(id)}`,
      ),
    );
  } catch (error) {
    console.error(
      "Song request failed:",
      error,
    );

    return errorResponse(
      "Unable to fetch song",
      502,
    );
  }
}

async function handleTrack(
  req: Request,
  id: string,
): Promise<Response> {
  if (req.method !== "GET") {
    return errorResponse(
      "Method not allowed",
      405,
    );
  }

  if (!id) {
    return errorResponse(
      "Missing track ID",
      400,
    );
  }

  try {
    return await proxyResponse(
      buildUpstreamUrl(
        `/track/${encodeURIComponent(id)}`,
      ),
    );
  } catch (error) {
    console.error(
      "Track request failed:",
      error,
    );

    return errorResponse(
      "Unable to fetch track",
      502,
    );
  }
}

async function handleArtist(
  req: Request,
  id: string,
): Promise<Response> {
  if (req.method !== "GET") {
    return errorResponse(
      "Method not allowed",
      405,
    );
  }

  if (!id) {
    return errorResponse(
      "Missing artist ID",
      400,
    );
  }

  try {
    return await proxyResponse(
      buildUpstreamUrl(
        `/artist/${encodeURIComponent(id)}`,
      ),
    );
  } catch (error) {
    console.error(
      "Artist request failed:",
      error,
    );

    return errorResponse(
      "Unable to fetch artist",
      502,
    );
  }
}

async function handleAlbum(
  req: Request,
  id: string,
): Promise<Response> {
  if (req.method !== "GET") {
    return errorResponse(
      "Method not allowed",
      405,
    );
  }

  if (!id) {
    return errorResponse(
      "Missing album ID",
      400,
    );
  }

  try {
    return await proxyResponse(
      buildUpstreamUrl(
        `/album/${encodeURIComponent(id)}`,
      ),
    );
  } catch (error) {
    console.error(
      "Album request failed:",
      error,
    );

    return errorResponse(
      "Unable to fetch album",
      502,
    );
  }
}

async function handleQueue(
  req: Request,
  id: string,
): Promise<Response> {
  if (req.method !== "GET") {
    return errorResponse(
      "Method not allowed",
      405,
    );
  }

  if (!id) {
    return errorResponse(
      "Missing song ID",
      400,
    );
  }

  try {
    return await proxyResponse(
      buildUpstreamUrl(
        `/queue/${encodeURIComponent(id)}`,
      ),
    );
  } catch (error) {
    console.error(
      "Queue request failed:",
      error,
    );

    return errorResponse(
      "Unable to create queue",
      502,
    );
  }
}

async function handleRecommendations(
  req: Request,
  id: string,
): Promise<Response> {
  if (req.method !== "GET") {
    return errorResponse(
      "Method not allowed",
      405,
    );
  }

  if (!id) {
    return errorResponse(
      "Missing queue ID",
      400,
    );
  }

  try {
    return await proxyResponse(
      buildUpstreamUrl(
        `/recommendations/queue/${encodeURIComponent(
          id,
        )}`,
      ),
    );
  } catch (error) {
    console.error(
      "Recommendation request failed:",
      error,
    );

    return errorResponse(
      "Unable to fetch recommendations",
      502,
    );
  }
}

async function handleStream(
  req: Request,
  id: string,
): Promise<Response> {
  if (
    req.method !== "GET" &&
    req.method !== "HEAD"
  ) {
    return errorResponse(
      "Method not allowed",
      405,
    );
  }

  if (!id) {
    return errorResponse(
      "Missing song ID",
      400,
    );
  }

  try {
    const upstreamUrl =
      buildUpstreamUrl(
        `/stream/${encodeURIComponent(id)}`,
      );

    const headers: Record<
      string,
      string
    > = {
      ...MUSIC_HEADERS,
    };

    /*
     * Forward byte ranges so the HTML5
     * audio element can seek correctly.
     */
    const range =
      req.headers.get("range");

    if (range) {
      headers.Range = range;
    }

    const response =
      await fetch(upstreamUrl, {
        method:
          req.method === "HEAD"
            ? "HEAD"
            : "GET",

        headers,
      });

    const responseHeaders =
      new Headers();

    const copyHeaders = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "etag",
      "last-modified",
    ];

    for (const name of copyHeaders) {
      const value =
        response.headers.get(name);

      if (value) {
        responseHeaders.set(
          name,
          value,
        );
      }
    }

    responseHeaders.set(
      "Access-Control-Allow-Origin",
      "*",
    );

    return new Response(
      req.method === "HEAD"
        ? null
        : response.body,
      {
        status: response.status,
        headers: responseHeaders,
      },
    );
  } catch (error) {
    console.error(
      "Music stream failed:",
      error,
    );

    return errorResponse(
      "Unable to stream track",
      502,
    );
  }
}

async function handleLyrics(
  req: Request,
  id: string,
): Promise<Response> {
  if (req.method !== "GET") {
    return errorResponse(
      "Method not allowed",
      405,
    );
  }

  if (!id) {
    return errorResponse(
      "Missing song ID",
      400,
    );
  }

  const url = new URL(req.url);

  const params = new URLSearchParams();

  const title =
    getQueryParam(url, "title");

  const artist =
    getQueryParam(url, "artist");

  const duration =
    getQueryParam(url, "duration");

  if (title) {
    params.set("title", title);
  }

  if (artist) {
    params.set("artist", artist);
  }

  if (duration) {
    params.set(
      "duration",
      duration,
    );
  }

  try {
    return await proxyResponse(
      buildUpstreamUrl(
        `/lyrics/${encodeURIComponent(id)}`,
        params,
      ),
    );
  } catch (error) {
    console.error(
      "Lyrics request failed:",
      error,
    );

    return errorResponse(
      "Unable to fetch lyrics",
      502,
    );
  }
}

async function handleLyricsPrefetch(
  req: Request,
): Promise<Response> {
  if (req.method !== "POST") {
    return errorResponse(
      "Method not allowed",
      405,
    );
  }

  try {
    const body = await req.json() as {
      source?: unknown;
    };

    const response =
      await fetch(
        buildUpstreamUrl(
          "/lyrics/prefetch",
        ),
        {
          method: "POST",
          headers: {
            ...MUSIC_HEADERS,
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(body),
        },
      );

    return new Response(
      response.body,
      {
        status: response.status,
        headers: {
          "Content-Type":
            response.headers.get(
              "content-type",
            ) ??
            "application/json",
        },
      },
    );
  } catch (error) {
    console.error(
      "Lyrics prefetch failed:",
      error,
    );

    return errorResponse(
      "Unable to prefetch lyrics",
      502,
    );
  }
}

async function handleLossless(
  req: Request,
  id: string,
): Promise<Response> {
  if (req.method !== "GET") {
    return errorResponse(
      "Method not allowed",
      405,
    );
  }

  if (!id) {
    return errorResponse(
      "Missing Qobuz ID",
      400,
    );
  }

  try {
    return await proxyResponse(
      buildUpstreamUrl(
        `/lossless/qobuz/${encodeURIComponent(
          id,
        )}`,
      ),
    );
  } catch (error) {
    console.error(
      "Lossless request failed:",
      error,
    );

    return errorResponse(
      "Unable to fetch lossless stream",
      502,
    );
  }
}

async function handleMusicImage(
  req: Request,
  idAndPath: string,
): Promise<Response> {
  if (req.method !== "GET") {
    return errorResponse(
      "Method not allowed",
      405,
    );
  }

  if (!idAndPath) {
    return errorResponse(
      "Missing image ID",
      400,
    );
  }

  const parts =
    idAndPath.split("/");

  const id =
    parts.shift();

  if (!id) {
    return errorResponse(
      "Missing image ID",
      400,
    );
  }

  /*
   * Example:
   *
   * /api/music/m-img/9cHbvRUALrc/maxresdefault.jpg
   *
   * becomes:
   *
   * /api/m-img/9cHbvRUALrc/maxresdefault.jpg
   */

  const imagePath =
    parts.length > 0
      ? `/${parts.join("/")}`
      : "";

  const url =
    buildUpstreamUrl(
      `/m-img/${encodeURIComponent(id)}${imagePath}`,
      new URL(req.url).searchParams,
    );

  try {
    return await proxyResponse(
      url,
    );
  } catch (error) {
    console.error(
      "Music image failed:",
      error,
    );

    return errorResponse(
      "Unable to fetch image",
      502,
    );
  }
}

async function handleArtistImage(
  req: Request,
  id: string,
): Promise<Response> {
  if (req.method !== "GET") {
    return errorResponse(
      "Method not allowed",
      405,
    );
  }

  if (!id) {
    return errorResponse(
      "Missing artist channel ID",
      400,
    );
  }

  try {
    return await proxyResponse(
      buildUpstreamUrl(
        `/artist-img/${encodeURIComponent(
          id,
        )}`,
      ),
    );
  } catch (error) {
    console.error(
      "Artist image failed:",
      error,
    );

    return errorResponse(
      "Unable to fetch artist image",
      502,
    );
  }
}

async function handleL3(
  req: Request,
  path: string,
): Promise<Response> {
  if (req.method !== "GET") {
    return errorResponse(
      "Method not allowed",
      405,
    );
  }

  const value =
    path.replace(
      /^\/api\/music\/l3\/?/,
      "",
    );

  if (!value) {
    return errorResponse(
      "Missing L3 URL",
      400,
    );
  }

  try {
    /*
     * The upstream API expects the L3 URL
     * as the path after /l3/.
     */
    const upstreamUrl =
      `${MUSIC_API_BASE}/l3/${value}`;

    return await proxyResponse(
      upstreamUrl,
    );
  } catch (error) {
    console.error(
      "L3 request failed:",
      error,
    );

    return errorResponse(
      "Unable to fetch L3 resource",
      502,
    );
  }
}

async function handleSource(
  req: Request,
): Promise<Response> {
  if (req.method === "GET") {
    return json({
      current: currentSource,
    });
  }

  if (req.method !== "POST") {
    return errorResponse(
      "Method not allowed",
      405,
    );
  }

  try {
    const body = await req.json() as {
      source?: unknown;
    };

    const source =
      body?.source;

    /*
     * The musicthing.space search API
     * currently returns YouTube-based
     * results. We still keep this state
     * endpoint so the frontend can remember
     * the selected source.
     */
    if (
      source !== "youtube" &&
      source !== "qobuz" &&
      source !== "soundcloud"
    ) {
      return errorResponse(
        "Invalid music source",
        400,
      );
    }

    currentSource = source;

    return json({
      current: currentSource,
    });
  } catch {
    return errorResponse(
      "Invalid JSON body",
      400,
    );
  }
}

/**
 * Main music router.
 *
 * Your main server should contain:
 *
 *   const musicR = await handleMusicRequest(req);
 *
 *   if (musicR) {
 *     return musicR;
 *   }
 */
export async function handleMusicRequest(
  req: Request,
): Promise<Response | null> {
  const url =
    new URL(req.url);

  const path =
    url.pathname;

  if (
    !path.startsWith(
      "/api/music",
    )
  ) {
    return null;
  }

  /*
   * /api/music
   */
  if (
    path === "/api/music" ||
    path === "/api/music/"
  ) {
    return json({
      ok: true,
      service: "music",
      source: currentSource,
    });
  }

  /*
   * Search
   *
   * GET /api/music/search?q=...
   */
  if (
    path === "/api/music/search"
  ) {
    return handleSearch(req);
  }

  /*
   * Source
   *
   * GET  /api/music/source
   * POST /api/music/source
   */
  if (
    path === "/api/music/source"
  ) {
    return handleSource(req);
  }

  /*
   * Lyrics prefetch
   *
   * POST /api/music/lyrics/prefetch
   */
  if (
    path ===
    "/api/music/lyrics/prefetch"
  ) {
    return handleLyricsPrefetch(req);
  }

  /*
   * L3 image/resource proxy
   *
   * /api/music/l3/*
   */
  if (
    path.startsWith(
      "/api/music/l3/",
    )
  ) {
    return handleL3(
      req,
      path,
    );
  }

  /*
   * Music image
   *
   * /api/music/m-img/:id/*
   */
  if (
    path.startsWith(
      "/api/music/m-img/",
    )
  ) {
    const value =
      path.slice(
        "/api/music/m-img/"
          .length,
      );

    return handleMusicImage(
      req,
      value,
    );
  }

  /*
   * Artist image
   *
   * GET /api/music/artist-img/:channelId
   */
  if (
    path.startsWith(
      "/api/music/artist-img/",
    )
  ) {
    const id =
      path.slice(
        "/api/music/artist-img/"
          .length,
      );

    return handleArtistImage(
      req,
      id,
    );
  }

  /*
   * Recommendations
   *
   * GET /api/music/recommendations/queue/:id
   */
  const recommendationsPrefix =
    "/api/music/recommendations/queue/";

  if (
    path.startsWith(
      recommendationsPrefix,
    )
  ) {
    const id =
      path.slice(
        recommendationsPrefix.length,
      );

    return handleRecommendations(
      req,
      id,
    );
  }

  /*
   * Lossless Qobuz
   *
   * GET /api/music/lossless/qobuz/:id
   */
  const losslessPrefix =
    "/api/music/lossless/qobuz/";

  if (
    path.startsWith(
      losslessPrefix,
    )
  ) {
    const id =
      path.slice(
        losslessPrefix.length,
      );

    return handleLossless(
      req,
      id,
    );
  }

  /*
   * Stream
   *
   * GET /api/music/stream/:id
   */
  const streamPrefix =
    "/api/music/stream/";

  if (
    path.startsWith(
      streamPrefix,
    )
  ) {
    const id =
      path.slice(
        streamPrefix.length,
      );

    return handleStream(
      req,
      id,
    );
  }

  /*
   * Lyrics
   *
   * GET /api/music/lyrics/:id
   */
  const lyricsPrefix =
    "/api/music/lyrics/";

  if (
    path.startsWith(
      lyricsPrefix,
    )
  ) {
    const id =
      path.slice(
        lyricsPrefix.length,
      );

    return handleLyrics(
      req,
      id,
    );
  }

  /*
   * Queue
   *
   * GET /api/music/queue/:id
   */
  const queuePrefix =
    "/api/music/queue/";

  if (
    path.startsWith(
      queuePrefix,
    )
  ) {
    const id =
      path.slice(
        queuePrefix.length,
      );

    return handleQueue(
      req,
      id,
    );
  }

  /*
   * Track metadata
   *
   * GET /api/music/track/:id
   */
  const trackPrefix =
    "/api/music/track/";

  if (
    path.startsWith(
      trackPrefix,
    )
  ) {
    const id =
      path.slice(
        trackPrefix.length,
      );

    return handleTrack(
      req,
      id,
    );
  }

  /*
   * Song metadata
   *
   * GET /api/music/song/:id
   */
  const songPrefix =
    "/api/music/song/";

  if (
    path.startsWith(
      songPrefix,
    )
  ) {
    const id =
      path.slice(
        songPrefix.length,
      );

    return handleSong(
      req,
      id,
    );
  }

  /*
   * Artist metadata
   *
   * GET /api/music/artist/:id
   */
  const artistPrefix =
    "/api/music/artist/";

  if (
    path.startsWith(
      artistPrefix,
    )
  ) {
    const id =
      path.slice(
        artistPrefix.length,
      );

    return handleArtist(
      req,
      id,
    );
  }

  /*
   * Album metadata
   *
   * GET /api/music/album/:id
   */
  const albumPrefix =
    "/api/music/album/";

  if (
    path.startsWith(
      albumPrefix,
    )
  ) {
    const id =
      path.slice(
        albumPrefix.length,
      );

    return handleAlbum(
      req,
      id,
    );
  }

  /*
   * Unknown music endpoint.
   */
  return json(
    {
      error: "Unknown music endpoint",
    },
    404,
  );
}