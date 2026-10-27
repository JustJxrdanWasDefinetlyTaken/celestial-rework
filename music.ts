const music_api_base = "https://musicthing.space/api";
const music_api_token = "galactic";

const music_headers = {
  Authorization: `Bearer ${music_api_token}`,
  Accept: "application/json"
};

let current_source = "youtube";

function json(
  data: unknown,
  status = 200,
  extra_headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra_headers
    }
  });
}

function error_response(
  message: string,
  status = 500
): Response {
  return json(
    {
      error: message
    },
    status
  );
}

function get_query_param(
  url: URL,
  name: string
): string | null {
  const value = url.searchParams.get(name);

  if (!value) return null;

  return value.trim() || null;
}

function build_upstream_url(
  path: string,
  search_params?: URLSearchParams
): string {
  const url = new URL(
    `${music_api_base}${path}`
  );

  if (search_params) {
    for (const [key, value] of search_params.entries()) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

async function proxy_response(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...music_headers,
      ...(options.headers ?? {})
    }
  });

  const headers = new Headers();

  const content_type =
    response.headers.get("content-type");

  if (content_type) {
    headers.set(
      "Content-Type",
      content_type
    );
  }

  const content_length =
    response.headers.get("content-length");

  if (content_length) {
    headers.set(
      "Content-Length",
      content_length
    );
  }

  const cache_control =
    response.headers.get("cache-control");

  if (cache_control) {
    headers.set(
      "Cache-Control",
      cache_control
    );
  } else {
    headers.set(
      "Cache-Control",
      "no-store"
    );
  }

  const content_range =
    response.headers.get("content-range");

  if (content_range) {
    headers.set(
      "Content-Range",
      content_range
    );
  }

  const accept_ranges =
    response.headers.get("accept-ranges");

  if (accept_ranges) {
    headers.set(
      "Accept-Ranges",
      accept_ranges
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
      headers
    }
  );
}

function normalize_search_result(item: any) {
  const result_type = String(
    item?.resultType ||
    item?.type ||
    item?.category ||
    ""
  ).toLowerCase();

  const artists =
    Array.isArray(item?.artists)
      ? item.artists
      : [];

  const artist = artists
    .map((value: any) => value?.name)
    .filter(Boolean)
    .join(", ");

  const thumbnails =
    Array.isArray(item?.thumbnails)
      ? item.thumbnails
      : [];

  const artwork =
    thumbnails.length
      ? thumbnails[
          thumbnails.length - 1
        ]?.url || ""
      : "";

  if (result_type === "artist") {
    const id =
      item?.browseId ||
      item?.id ||
      item?.channelId ||
      item?.artistId ||
      null;

    return {
      ...item,
      id,
      browseId:
        item?.browseId ||
        id,
      artistId:
        item?.artistId ||
        id,
      source:
        item?.source ||
        item?.provider ||
        "youtube",
      provider:
        item?.provider ||
        item?.source ||
        "youtube",
      resultType: "artist",
      title:
        item?.title ||
        item?.artist ||
        item?.name ||
        "unknown artist",
      artist:
        item?.artist ||
        item?.title ||
        item?.name ||
        "unknown artist",
      artwork,
      thumbnails,
      raw: item
    };
  }

  if (result_type === "album") {
    const id =
      item?.browseId ||
      item?.id ||
      item?.albumId ||
      item?.playlistId ||
      null;

    return {
      ...item,
      id,
      browseId:
        item?.browseId ||
        null,
      albumId:
        item?.albumId ||
        id,
      playlistId:
        item?.playlistId ||
        null,
      source:
        item?.source ||
        item?.provider ||
        "youtube",
      provider:
        item?.provider ||
        item?.source ||
        "youtube",
      resultType: "album",
      title:
        item?.title ||
        item?.name ||
        item?.album?.name ||
        item?.album?.title ||
        "unknown album",
      artist:
        artist ||
        item?.artist ||
        "unknown artist",
      artwork,
      thumbnails,
      raw: item
    };
  }

  if (
    result_type === "playlist" ||
    result_type === "podcast" ||
    result_type === "episode"
  ) {
    const id =
      item?.browseId ||
      item?.id ||
      item?.playlistId ||
      item?.videoId ||
      null;

    return {
      ...item,
      id,
      source:
        item?.source ||
        item?.provider ||
        "youtube",
      provider:
        item?.provider ||
        item?.source ||
        "youtube",
      resultType: result_type,
      artwork,
      thumbnails,
      raw: item
    };
  }

  const id =
    item?.videoId ||
    item?.id ||
    item?.trackId ||
    null;

  return {
    ...item,
    id,
    videoId:
      item?.videoId ||
      id,
    source:
      item?.source ||
      item?.provider ||
      "youtube",
    provider:
      item?.provider ||
      item?.source ||
      "youtube",
    title:
      item?.title ||
      "unknown title",
    artist:
      artist ||
      item?.artist ||
      "unknown artist",
    album:
      item?.album?.name ||
      item?.album?.title ||
      item?.album ||
      "",
    duration:
      Number(
        item?.duration_seconds
      ) ||
      Number(
        item?.duration
      ) ||
      0,
    durationText:
      typeof item?.duration === "string"
        ? item.duration
        : item?.durationText || "",
    artwork,
    thumbnails,
    videoType:
      item?.videoType ||
      null,
    resultType:
      result_type ||
      (item?.videoId
        ? "song"
        : null),
    category:
      item?.category ||
      null,
    lossless:
      item?.lossless ||
      null,
    artistId:
      artists?.[0]?.id ||
      artists?.[0]?.browseId ||
      item?.artistId ||
      null,
    raw: item
  };
}

async function handle_search(
  req: Request
): Promise<Response> {
  if (req.method !== "GET") {
    return error_response(
      "method not allowed",
      405
    );
  }

  const url =
    new URL(req.url);

  const query =
    get_query_param(
      url,
      "q"
    ) ??
    get_query_param(
      url,
      "query"
    );

  if (!query) {
    return json({
      items: [],
      query: "",
      source: current_source
    });
  }

  const params =
    new URLSearchParams();

  params.set(
    "q",
    query
  );

  try {
    const response =
      await fetch(
        build_upstream_url(
          "/search",
          params
        ),
        {
          headers:
            music_headers
        }
      );

    const text =
      await response.text();

    if (!response.ok) {
      return new Response(
        text ||
        JSON.stringify({
          error:
            "music search failed"
        }),
        {
          status:
            response.status,
          headers: {
            "Content-Type":
              response.headers.get(
                "content-type"
              ) ??
              "application/json"
          }
        }
      );
    }

    let data: unknown;

    try {
      data =
        JSON.parse(text);
    } catch {
      return error_response(
        "music api returned invalid json",
        502
      );
    }

    const results =
      Array.isArray(data)
        ? data
        : Array.isArray(
            (data as any)?.items
          )
          ? (data as any).items
          : Array.isArray(
              (data as any)?.results
            )
            ? (data as any).results
            : Array.isArray(
                (data as any)?.collection
              )
              ? (data as any).collection
              : [];

    const items = results
      .filter(
        (item: any) =>
          item &&
          typeof item === "object"
      )
      .map(
        normalize_search_result
      )
      .filter(
        (item: any) =>
          item?.id
      );

    const source =
      items.find(
        (item: any) =>
          item?.source
      )?.source ||
      current_source;

    return json({
      items,
      query,
      source
    });
  } catch (error) {
    console.error(
      "music search error:",
      error
    );

    return error_response(
      error instanceof Error
        ? error.message
        : "unable to search music",
      502
    );
  }
}

async function handle_song(
  req: Request,
  id: string
): Promise<Response> {
  if (req.method !== "GET") {
    return error_response(
      "method not allowed",
      405
    );
  }

  if (!id) {
    return error_response(
      "missing song id",
      400
    );
  }

  try {
    return await proxy_response(
      build_upstream_url(
        `/song/${encodeURIComponent(id)}`
      )
    );
  } catch (error) {
    console.error(
      "song request failed:",
      error
    );

    return error_response(
      "unable to fetch song",
      502
    );
  }
}

async function handle_track(
  req: Request,
  id: string
): Promise<Response> {
  if (req.method !== "GET") {
    return error_response(
      "method not allowed",
      405
    );
  }

  if (!id) {
    return error_response(
      "missing track id",
      400
    );
  }

  try {
    return await proxy_response(
      build_upstream_url(
        `/track/${encodeURIComponent(id)}`
      )
    );
  } catch (error) {
    console.error(
      "track request failed:",
      error
    );

    return error_response(
      "unable to fetch track",
      502
    );
  }
}

async function handle_artist(
  req: Request,
  id: string
): Promise<Response> {
  if (req.method !== "GET") {
    return error_response(
      "method not allowed",
      405
    );
  }

  if (!id) {
    return error_response(
      "missing artist id",
      400
    );
  }

  try {
    return await proxy_response(
      build_upstream_url(
        `/artist/${encodeURIComponent(id)}`
      )
    );
  } catch (error) {
    console.error(
      "artist request failed:",
      error
    );

    return error_response(
      "unable to fetch artist",
      502
    );
  }
}

async function handle_album(
  req: Request,
  id: string
): Promise<Response> {
  if (req.method !== "GET") {
    return error_response(
      "method not allowed",
      405
    );
  }

  if (!id) {
    return error_response(
      "missing album id",
      400
    );
  }

  try {
    return await proxy_response(
      build_upstream_url(
        `/album/${encodeURIComponent(id)}`
      )
    );
  } catch (error) {
    console.error(
      "album request failed:",
      error
    );

    return error_response(
      "unable to fetch album",
      502
    );
  }
}

async function handle_queue(
  req: Request,
  id: string
): Promise<Response> {
  if (req.method !== "GET") {
    return error_response(
      "method not allowed",
      405
    );
  }

  if (!id) {
    return error_response(
      "missing song id",
      400
    );
  }

  try {
    return await proxy_response(
      build_upstream_url(
        `/queue/${encodeURIComponent(id)}`
      )
    );
  } catch (error) {
    console.error(
      "queue request failed:",
      error
    );

    return error_response(
      "unable to create queue",
      502
    );
  }
}

async function handle_recommendations(
  req: Request,
  id: string
): Promise<Response> {
  if (req.method !== "GET") {
    return error_response(
      "method not allowed",
      405
    );
  }

  if (!id) {
    return error_response(
      "missing queue id",
      400
    );
  }

  try {
    return await proxy_response(
      build_upstream_url(
        `/recommendations/queue/${encodeURIComponent(id)}`
      )
    );
  } catch (error) {
    console.error(
      "recommendation request failed:",
      error
    );

    return error_response(
      "unable to fetch recommendations",
      502
    );
  }
}

async function handle_stream(
  req: Request,
  id: string
): Promise<Response> {
  if (
    req.method !== "GET" &&
    req.method !== "HEAD"
  ) {
    return error_response(
      "method not allowed",
      405
    );
  }

  if (!id) {
    return error_response(
      "missing song id",
      400
    );
  }

  try {
    const upstream_url =
      build_upstream_url(
        `/stream/${encodeURIComponent(id)}`
      );

    const headers: Record<
      string,
      string
    > = {
      ...music_headers
    };

    const range =
      req.headers.get("range");

    if (range) {
      headers.Range =
        range;
    }

    const response =
      await fetch(
        upstream_url,
        {
          method:
            req.method === "HEAD"
              ? "HEAD"
              : "GET",
          headers
        }
      );

    const response_headers =
      new Headers();

    const copy_headers = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "etag",
      "last-modified"
    ];

    for (
      const name
      of copy_headers
    ) {
      const value =
        response.headers.get(
          name
        );

      if (value) {
        response_headers.set(
          name,
          value
        );
      }
    }

    response_headers.set(
      "Access-Control-Allow-Origin",
      "*"
    );

    return new Response(
      req.method === "HEAD"
        ? null
        : response.body,
      {
        status:
          response.status,
        headers:
          response_headers
      }
    );
  } catch (error) {
    console.error(
      "music stream failed:",
      error
    );

    return error_response(
      "unable to stream track",
      502
    );
  }
}

async function handle_lyrics(
  req: Request,
  id: string
): Promise<Response> {
  if (req.method !== "GET") {
    return error_response(
      "method not allowed",
      405
    );
  }

  const url = new URL(req.url);

  const title =
    get_query_param(
      url,
      "title"
    );

  const artist =
    get_query_param(
      url,
      "artist"
    );

  const duration =
    get_query_param(
      url,
      "duration"
    );

  if (!title || !artist) {
    return error_response(
      "missing title or artist",
      400
    );
  }

  const params =
    new URLSearchParams();

  params.set(
    "track_name",
    title
  );

  params.set(
    "artist_name",
    artist
  );

  if (duration) {
    const seconds =
      Math.round(
        Number(duration)
      );

    if (
      Number.isFinite(seconds) &&
      seconds > 0
    ) {
      params.set(
        "duration",
        String(seconds)
      );
    }
  }

  try {
    const response =
      await fetch(
        `https://lrclib.net/api/get?${params.toString()}`,
        {
          headers: {
            Accept:
              "application/json",
            "User-Agent":
              "celestial/1.0"
          }
        }
      );

    if (response.status === 404) {
      return json({
        syncedLyrics: null,
        plainLyrics: null
      });
    }

    if (!response.ok) {
      return error_response(
        "unable to fetch lyrics",
        502
      );
    }

    const data =
      await response.json() as any;

    return json({
      id:
        data?.id ||
        null,
      trackName:
        data?.trackName ||
        title,
      artistName:
        data?.artistName ||
        artist,
      albumName:
        data?.albumName ||
        null,
      duration:
        data?.duration ||
        null,
      instrumental:
        data?.instrumental ||
        false,
      syncedLyrics:
        data?.syncedLyrics ||
        null,
      plainLyrics:
        data?.plainLyrics ||
        null
    });
  } catch (error) {
    console.error(
      "lyrics request failed:",
      error
    );

    return error_response(
      "unable to fetch lyrics",
      502
    );
  }
}

async function handle_lyrics_prefetch(
  req: Request
): Promise<Response> {
  if (req.method !== "POST") {
    return error_response(
      "method not allowed",
      405
    );
  }

  try {
    const body =
      await req.json() as {
        source?: unknown;
      };

    const response =
      await fetch(
        build_upstream_url(
          "/lyrics/prefetch"
        ),
        {
          method: "POST",
          headers: {
            ...music_headers,
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify(body)
        }
      );

    return new Response(
      response.body,
      {
        status:
          response.status,
        headers: {
          "Content-Type":
            response.headers.get(
              "content-type"
            ) ??
            "application/json"
        }
      }
    );
  } catch (error) {
    console.error(
      "lyrics prefetch failed:",
      error
    );

    return error_response(
      "unable to prefetch lyrics",
      502
    );
  }
}
async function handle_lossless(
  req: Request,
  id: string
): Promise<Response> {
  if (req.method !== "GET") {
    return error_response(
      "method not allowed",
      405
    );
  }

  if (!id) {
    return error_response(
      "missing qobuz id",
      400
    );
  }

  try {
    return await proxy_response(
      build_upstream_url(
        `/lossless/qobuz/${encodeURIComponent(id)}`
      )
    );
  } catch (error) {
    console.error(
      "lossless request failed:",
      error
    );

    return error_response(
      "unable to fetch lossless stream",
      502
    );
  }
}

async function handle_music_image(
  req: Request,
  id_and_path: string
): Promise<Response> {
  if (req.method !== "GET") {
    return error_response(
      "method not allowed",
      405
    );
  }

  if (!id_and_path) {
    return error_response(
      "missing image id",
      400
    );
  }

  const parts =
    id_and_path.split("/");

  const id =
    parts.shift();

  if (!id) {
    return error_response(
      "missing image id",
      400
    );
  }

  const image_path =
    parts.length > 0
      ? `/${parts.join("/")}`
      : "";

  const url =
    build_upstream_url(
      `/m-img/${encodeURIComponent(id)}${image_path}`,
      new URL(req.url).searchParams
    );

  try {
    return await proxy_response(
      url
    );
  } catch (error) {
    console.error(
      "music image failed:",
      error
    );

    return error_response(
      "unable to fetch image",
      502
    );
  }
}

async function handle_artist_image(
  req: Request,
  id: string
): Promise<Response> {
  if (req.method !== "GET") {
    return error_response(
      "method not allowed",
      405
    );
  }

  if (!id) {
    return error_response(
      "missing artist channel id",
      400
    );
  }

  try {
    return await proxy_response(
      build_upstream_url(
        `/artist-img/${encodeURIComponent(id)}`
      )
    );
  } catch (error) {
    console.error(
      "artist image failed:",
      error
    );

    return error_response(
      "unable to fetch artist image",
      502
    );
  }
}

async function handle_l3(
  req: Request,
  path: string
): Promise<Response> {
  if (req.method !== "GET") {
    return error_response(
      "method not allowed",
      405
    );
  }

  const value =
    path.replace(
      /^\/api\/music\/l3\/?/,
      ""
    );

  if (!value) {
    return error_response(
      "missing l3 url",
      400
    );
  }

  try {
    const upstream_url =
      `${music_api_base}/l3/${value}`;

    return await proxy_response(
      upstream_url
    );
  } catch (error) {
    console.error(
      "l3 request failed:",
      error
    );

    return error_response(
      "unable to fetch l3 resource",
      502
    );
  }
}

async function handle_source(
  req: Request
): Promise<Response> {
  if (req.method === "GET") {
    return json({
      current:
        current_source
    });
  }

  if (req.method !== "POST") {
    return error_response(
      "method not allowed",
      405
    );
  }

  try {
    const body =
      await req.json() as {
        source?: unknown;
      };

    const source =
      body?.source;

    if (
      source !== "youtube" &&
      source !== "qobuz" &&
      source !== "soundcloud"
    ) {
      return error_response(
        "invalid music source",
        400
      );
    }

    current_source =
      source;

    return json({
      current:
        current_source
    });
  } catch {
    return error_response(
      "invalid json body",
      400
    );
  }
}

export async function handleMusicRequest(
  req: Request
): Promise<Response | null> {
  const url =
    new URL(req.url);

  const path =
    url.pathname;

  if (
    !path.startsWith(
      "/api/music"
    )
  ) {
    return null;
  }

  if (
    path === "/api/music" ||
    path === "/api/music/"
  ) {
    return json({
      ok: true,
      service: "music",
      source:
        current_source
    });
  }

  if (
    path ===
    "/api/music/search"
  ) {
    return handle_search(
      req
    );
  }

  if (
    path ===
    "/api/music/source"
  ) {
    return handle_source(
      req
    );
  }

  if (
    path ===
    "/api/music/lyrics/prefetch"
  ) {
    return handle_lyrics_prefetch(
      req
    );
  }

  if (
    path.startsWith(
      "/api/music/l3/"
    )
  ) {
    return handle_l3(
      req,
      path
    );
  }

  if (
    path.startsWith(
      "/api/music/m-img/"
    )
  ) {
    const value =
      path.slice(
        "/api/music/m-img/"
          .length
      );

    return handle_music_image(
      req,
      value
    );
  }

  if (
    path.startsWith(
      "/api/music/artist-img/"
    )
  ) {
    const id =
      path.slice(
        "/api/music/artist-img/"
          .length
      );

    return handle_artist_image(
      req,
      id
    );
  }

  const recommendations_prefix =
    "/api/music/recommendations/queue/";

  if (
    path.startsWith(
      recommendations_prefix
    )
  ) {
    const id =
      path.slice(
        recommendations_prefix.length
      );

    return handle_recommendations(
      req,
      id
    );
  }

  const lossless_prefix =
    "/api/music/lossless/qobuz/";

  if (
    path.startsWith(
      lossless_prefix
    )
  ) {
    const id =
      path.slice(
        lossless_prefix.length
      );

    return handle_lossless(
      req,
      id
    );
  }

  const stream_prefix =
    "/api/music/stream/";

  if (
    path.startsWith(
      stream_prefix
    )
  ) {
    const id =
      path.slice(
        stream_prefix.length
      );

    return handle_stream(
      req,
      id
    );
  }

  const lyrics_prefix =
    "/api/music/lyrics/";

  if (
    path.startsWith(
      lyrics_prefix
    )
  ) {
    const id =
      path.slice(
        lyrics_prefix.length
      );

    return handle_lyrics(
      req,
      id
    );
  }

  const queue_prefix =
    "/api/music/queue/";

  if (
    path.startsWith(
      queue_prefix
    )
  ) {
    const id =
      path.slice(
        queue_prefix.length
      );

    return handle_queue(
      req,
      id
    );
  }

  const track_prefix =
    "/api/music/track/";

  if (
    path.startsWith(
      track_prefix
    )
  ) {
    const id =
      path.slice(
        track_prefix.length
      );

    return handle_track(
      req,
      id
    );
  }

  const song_prefix =
    "/api/music/song/";

  if (
    path.startsWith(
      song_prefix
    )
  ) {
    const id =
      path.slice(
        song_prefix.length
      );

    return handle_song(
      req,
      id
    );
  }

  const artist_prefix =
    "/api/music/artist/";

  if (
    path.startsWith(
      artist_prefix
    )
  ) {
    const id =
      path.slice(
        artist_prefix.length
      );

    return handle_artist(
      req,
      id
    );
  }

  const album_prefix =
    "/api/music/album/";

  if (
    path.startsWith(
      album_prefix
    )
  ) {
    const id =
      path.slice(
        album_prefix.length
      );

    return handle_album(
      req,
      id
    );
  }

  return json(
    {
      error:
        "unknown music endpoint"
    },
    404
  );
}