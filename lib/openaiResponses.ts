export type ResponsesCreatePayload = Record<string, any>;

export class OpenAIHttpError extends Error {
  status: number;
  payload: any;

  constructor(status: number, message: string, payload: any) {
    super(message);
    this.name = "OpenAIHttpError";
    this.status = status;
    this.payload = payload;
  }
}

export async function openaiResponsesCreate(payload: ResponsesCreatePayload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY env var");
  }

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      // For privacy: don't store user prompts/output by default.
      store: false,
      ...payload,
    }),
  });

  const raw = await res.text();
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg = (json && (json.error?.message || json.message)) || `OpenAI API error (${res.status})`;
    throw new OpenAIHttpError(res.status, msg, json ?? raw);
  }

  if (json == null) {
    throw new OpenAIHttpError(res.status, "OpenAI API returned a non-JSON response", raw);
  }

  return json as any;
}

/**
 * Best-effort extraction of `output_text` (SDK convenience) or the first message text.
 */
export function extractOutputText(response: any): string {
  if (typeof response?.output_text === "string") return response.output_text;

  const output = response?.output;
  if (!Array.isArray(output)) return "";

  for (const item of output) {
    if (item?.type === "message") {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c?.type === "output_text" && typeof c?.text === "string") return c.text;
          if (c?.type === "text" && typeof c?.text === "string") return c.text;
        }
      }
    }
  }
  return "";
}
