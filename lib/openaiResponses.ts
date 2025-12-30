export type ResponsesCreatePayload = Record<string, any>;

/**
 * (Existing helper) OpenAI Responses API wrapper.
 * Kept for compatibility with other parts of your app.
 */
export async function openaiResponsesCreate(payload: ResponsesCreatePayload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY env var");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      store: false,
      ...payload,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (json && (json.error?.message || json.message)) || `OpenAI API error (${res.status})`;
    throw new Error(msg);
  }
  return json as any;
}

/**
 * Best-effort extraction of `output_text` or message text from Responses API results.
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

/**
 * New helper: Chat Completions + JSON Schema.
 * This avoids the `input_text`/`text.format` compatibility issues you hit with Responses.
 */
type JsonSchema = Record<string, any>;

type ChatCompletionArgs<T> = {
  model: string;
  system: string;
  user: any; // string OR [{type:'text'},{type:'image_url'}]
  schemaName: string;
  schema: JsonSchema;
  temperature?: number;
};

export async function openaiChatCompletionJson<T = any>({
  model,
  system,
  user,
  schemaName,
  schema,
  temperature = 0.2,
}: ChatCompletionArgs<T>): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY env var");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          strict: true,
          schema,
        },
      },
    }),
  });

  const raw = await res.text();
  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const msg = parsed?.error?.message || `OpenAI error (${res.status}).`;
    throw new Error(msg);
  }

  const content = parsed?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenAI returned no content.");

  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error("Failed to parse model JSON output.");
  }
}
