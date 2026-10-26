const astraOrigin = "https://astra-education.top";

interface CgBody {
    lesson?: string;
    studentRef?: string;
}

function getForwardedHeaders(
    req: Request
): Headers {
    const url = new URL(req.url);
    const headers = new Headers(req.headers);

    headers.delete("host");
    headers.delete("content-length");
    headers.delete("connection");
    headers.delete("upgrade");

    headers.set(
        "X-Forwarded-Host",
        url.host
    );

    headers.set(
        "X-Forwarded-Proto",
        url.protocol.replace(":", "")
    );

    headers.set(
        "X-Forwarded-Prefix",
        "/astra"
    );

    return headers;
}

export async function handleAstraProxy(
    req: Request
): Promise<Response> {
    const url = new URL(req.url);

    if (!url.pathname.startsWith("/astra/")) {
        return new Response(
            "not found",
            {
                status: 404
            }
        );
    }

    const upstreamPath =
        url.pathname.slice(
            "/astra".length
        );

    const upstreamUrl =
        astraOrigin +
        upstreamPath +
        url.search;

    try {
        const headers =
            getForwardedHeaders(req);

        const upstream = await fetch(
            upstreamUrl,
            {
                method: req.method,
                headers,
                body:
                    req.method === "GET" ||
                    req.method === "HEAD"
                        ? undefined
                        : await req.arrayBuffer(),
                redirect: "manual"
            }
        );

        const responseHeaders =
            new Headers(
                upstream.headers
            );

        responseHeaders.delete(
            "content-length"
        );

        responseHeaders.delete(
            "content-encoding"
        );

        return new Response(
            req.method === "HEAD"
                ? null
                : upstream.body,
            {
                status:
                    upstream.status,
                statusText:
                    upstream.statusText,
                headers:
                    responseHeaders
            }
        );
    } catch (error) {
    console.error(
        "astra proxy failed:",
        req.method,
        url.pathname,
        error
    );

    return Response.json(
            {
                error:
                    "astra proxy failed",
                detail:
                    error instanceof Error
                        ? error.message
                        : String(error)
            },
            {
                status: 502
            }
        );
    }
}

export async function handleCgRequest(
    req: Request
): Promise<Response> {
    const corsHeaders = {
        "Access-Control-Allow-Origin":
            "*",
        "Access-Control-Allow-Methods":
            "POST, OPTIONS",
        "Access-Control-Allow-Headers":
            "Content-Type"
    };

    if (req.method === "OPTIONS") {
        return new Response(
            null,
            {
                status: 204,
                headers: corsHeaders
            }
        );
    }

    if (req.method !== "POST") {
        return Response.json(
            {
                error:
                    "method not allowed"
            },
            {
                status: 405,
                headers: corsHeaders
            }
        );
    }

    const key =
        Bun.env.ASTRA_SECRET_KEY;

    if (!key) {
        return Response.json(
            {
                error:
                    "missing ASTRA_SECRET_KEY"
            },
            {
                status: 500,
                headers: corsHeaders
            }
        );
    }

    try {
        const body =
            (await req.json()) as CgBody;

        const lesson =
            typeof body.lesson ===
            "string"
                ? body.lesson.trim()
                : "";

        const studentRef =
            typeof body.studentRef ===
            "string"
                ? body.studentRef.trim()
                : "celestial";

        if (!lesson) {
            return Response.json(
                {
                    error:
                        "lesson is required"
                },
                {
                    status: 400,
                    headers:
                        corsHeaders
                }
            );
        }

        const url =
            new URL(req.url);

        const upstream =
            await fetch(
                `${astraOrigin}/api/v1/assignments`,
                {
                    method: "POST",
                    headers: {
                        "Authorization":
                            `Bearer ${key}`,
                        "Content-Type":
                            "application/json",
                        "Accept":
                            "application/json",
                        "X-Forwarded-Host":
                            url.host,
                        "X-Forwarded-Proto":
                            url.protocol.replace(
                                ":",
                                ""
                            ),
                        "X-Forwarded-Prefix":
                            "/astra"
                    },
                    body:
                        JSON.stringify({
                            lesson,
                            studentRef
                        })
                }
            );

        const text =
            await upstream.text();

        return new Response(
            text,
            {
                status:
                    upstream.status,
                statusText:
                    upstream.statusText,
                headers: {
                    ...corsHeaders,
                    "Content-Type":
                        upstream.headers.get(
                            "content-type"
                        ) ??
                        "application/json"
                }
            }
        );
    } catch (error) {
        return Response.json(
            {
                error:
                    "failed to create astra session",
                detail:
                    error instanceof Error
                        ? error.message
                        : String(error)
            },
            {
                status: 500,
                headers:
                    corsHeaders
            }
        );
    }
}