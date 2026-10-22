import { scrapeListing } from "myinstants-scraper";

const MAX_LIMIT = 100;
const MAX_PAGES = 5;

export async function handleMyInstantsSearch(
    req: Request,
): Promise<Response> {
    const url = new URL(req.url);
    const query = url.searchParams.get("q")?.trim();

    if (!query) {
        return Response.json(
            { error: "Missing search query" },
            { status: 400 },
        );
    }

    const page = Math.max(
        1,
        Math.floor(Number(url.searchParams.get("page")) || 1),
    );

    const offset = Math.max(
        0,
        Math.floor(Number(url.searchParams.get("offset")) || 0),
    );

    const requestedLimit = Math.floor(
        Number(url.searchParams.get("limit")) || 20,
    );

    const limit = Math.min(
        MAX_LIMIT,
        Math.max(1, requestedLimit),
    );

    try {
        const searchUrl =
            `https://www.myinstants.com/en/search/?name=${encodeURIComponent(query)}`;

        const results = await scrapeListing(
            searchUrl,
            {
                maxPages: Math.min(MAX_PAGES, page),
            },
            {
                delayMs: 1000,
            },
        );

        // Normalize the scraper's response to an array.
        const sounds = Array.isArray(results)
            ? results
            : [];

        // Return the requested slice.
        const paginatedSounds = sounds.slice(
            offset,
            offset + limit,
        );

        return Response.json(paginatedSounds, {
            headers: {
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        console.error("MyInstants search failed:", error);

        return Response.json(
            {
                error: "MyInstants search failed",
                details:
                    error instanceof Error
                        ? error.message
                        : String(error),
            },
            { status: 500 },
        );
    }
}