import { scrapeListing } from "myinstants-scraper";

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

    try {
        const searchUrl =
            `https://www.myinstants.com/en/search/?name=${encodeURIComponent(query)}`;

        const results = await scrapeListing(
            searchUrl,
            {
                maxPages: 1,
            },
            {
                delayMs: 1000,
            },
        );

        return Response.json(results);
    } catch (error) {
        console.error(
            "MyInstants search failed:",
            error,
        );

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