interface AiMessage {
  role: string;
  content: string | any[];
}

interface AiRequest {
  model: string;
  messages: AiMessage[];
  temperature?: number;
  max_tokens?: number;
}

const aiBase = (
  process.env.AI_API_BASE ??
  "https://emis.zxs-is-very.cool/v1"
).replace(/\/+$/, "");

const aiApiKey = process.env.AI_API_KEY?.trim() ?? "";

export async function handleAiRequest(
  body: AiRequest,
): Promise<Response> {
  if (!aiApiKey) {
    throw new Error("AI_API_KEY is not configured");
  }

  const headers = new Headers();

  headers.set(
    "Content-Type",
    "application/json",
  );

  headers.set(
    "Authorization",
    `Bearer ${aiApiKey}`,
  );

  return fetch(
    `${aiBase}/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
  );
}
