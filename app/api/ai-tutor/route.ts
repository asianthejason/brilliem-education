import { auth, clerkClient } from "@clerk/nextjs/server";
import { searchLessons, type Lesson } from "@/lib/lessonCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mode = "answer_only" | "full_solution" | "stepwise";

type Body = {
  message?: string;
  text?: string;
  mode?: Mode;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  imageDataUrl?: string | null; // e.g. data:image/png;base64,...
};

type ApiOk = {
  ok: true;
  result: {
    finalAnswer: string;
    steps?: string[];
    fullSolution?: string;
    lessons?: Lesson[];
    displayText?: string;
    subject?: "math" | "science";
  };
};

type ApiErr = { ok: false; message: string; refusal?: boolean };

function safeString(v: unknown, max = 8000): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[\u2018\u2019\u201C\u201D]/g, "")
    .replace(/[.,。]/g, "");
}

function stripTrailingSentencePunct(s: string): string {
  return s.trim().replace(/[\s]*[.。]$/u, "");
}

function deriveFinalAnswerFromSteps(steps: string[]): string {
  const last = [...steps]
    .reverse()
    .map((s) => safeString(s, 4000))
    .find(Boolean);
  if (!last) return "";

  const cleaned = last.replace(/^\s*(?:\d+[\).:\-]\s*)/, "").trim();

  // Try grabbing the RHS of the last '=' in the last step.
  const eqIdx = cleaned.lastIndexOf("=");
  if (eqIdx !== -1 && eqIdx < cleaned.length - 1) {
    const cand = cleaned.slice(eqIdx + 1).trim();
    if (cand && /\d/.test(cand)) return stripTrailingSentencePunct(cand);
  }

  // Otherwise, grab the last number-like chunk.
  const hits = cleaned.match(/[-+]?\d+(?:\.\d+)?(?:\s*[a-zA-Z°/%]+(?:\/[a-zA-Z°]+)?)?/g);
  if (hits && hits.length) return stripTrailingSentencePunct(hits[hits.length - 1]);

  return "";
}


function sanitizeTutorText(input: string): string {
  if (!input) return input;
  let s = input;

  s = s.replace(/\\text\{([^}]*)\}/g, "$1");
  s = s.replace(/\\mathrm\{([^}]*)\}/g, "$1");
  s = s.replace(/\\times/g, "×");
  s = s.replace(/\\cdot/g, "·");
  s = s.replace(/\\left/g, "");
  s = s.replace(/\\right/g, "");

  const fracRe = /\\frac\{([^{}]+)\}\{([^{}]+)\}/g;
  for (let i = 0; i < 5 && fracRe.test(s); i++) {
    s = s.replace(fracRe, "($1)/($2)");
  }

  s = s.replace(/\\\\/g, "\n");
  s = s.replace(/\\([a-zA-Z]+)/g, "$1");
  s = s.replace(/[{}]/g, "");
  s = s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n");

  return s.trim();
}

function sanitizeSteps(steps?: string[]): string[] | undefined {
  if (!steps) return steps;
  return steps.map((x) => sanitizeTutorText(x));
}

function reconcileFinalAnswer(finalAnswer: string, derivedFromSteps: string): string {
  const derived = stripTrailingSentencePunct(derivedFromSteps);
  if (!derived) return finalAnswer;
  if (normalizeForCompare(finalAnswer) === normalizeForCompare(derived)) return finalAnswer;

  // Try to replace the last numeric chunk in the sentence with the derived value.
  const re = /[-+]?\d+(?:\.\d+)?(?:\s*[a-zA-Z°/%]+(?:\/[a-zA-Z°]+)?)?/g;
  const matches = [...finalAnswer.matchAll(re)];
  if (matches.length && matches[matches.length - 1].index != null) {
    const last = matches[matches.length - 1];
    const start = last.index as number;
    const end = start + last[0].length;
    return `${finalAnswer.slice(0, start)}${derived}${finalAnswer.slice(end)}`;
  }

  // Fall back to just the derived value.
  return derived;
}

function firstLine(s: string): string {
  const line = s.split("\n")[0]?.trim() ?? "";
  return line.slice(0, 80) || "New chat";
}

async function getUserTier(userId: string): Promise<string | null> {
  // clerkClient can be a function (newer versions) or an object (older versions)
  const client: any = typeof clerkClient === "function" ? await clerkClient() : clerkClient;
  const user = await client.users.getUser(userId);
  return (user?.unsafeMetadata?.tier as string | undefined) ?? null;
}

function jsonErr(message: string, status = 400, refusal = false): Response {
  const body: ApiErr = { ok: false, message, refusal };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function callOpenAIJson(args: {
  model: string;
  messages: any[];
  schemaName: string;
  schema: any;
  maxTokens?: number;
}): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY env var");

  const payload = {
    model: args.model,
    messages: args.messages,
    temperature: 0.2,
    max_tokens: args.maxTokens ?? 900,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: args.schemaName,
        strict: true,
        schema: args.schema,
      },
    },
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`OpenAI error (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") throw new Error("OpenAI returned empty content");
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned non-JSON content");
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return jsonErr("Unauthorized", 401);

    const tier = await getUserTier(userId);
    if (tier !== "lessons_ai") return jsonErr("AI Tutor is only available on the Lessons + AI Tutor plan.", 403);

    const body = (await req.json().catch(() => ({}))) as Body;

    // Step-by-step only (mode selection removed on UI)
    const mode: Mode = "stepwise";
    const userText = safeString((body as any).message ?? (body as any).text, 12000);
    const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : null;

    if (!userText && !imageDataUrl) {
      return jsonErr("Please type a question or upload a photo.", 400);
    }

    // ---- Lesson candidates (local search) ----
    // Use the first line as a query seed, and also pass a few tags if we can infer them later.
    const seedQuery = userText || "homework question";
    const lessonCandidates = searchLessons({ query: seedQuery, tags: [], limit: 10 });

    const candidatesText =
      "Lesson candidates (choose the best matches; do not invent new URLs):\n" +
      (lessonCandidates.length
        ? lessonCandidates
            .map(
              (l, i) =>
                `${i + 1}. ${l.title} | ${l.url} | difficulty: ${l.difficulty || "unknown"} | tags: ${(l.tags || []).join(
                  ", "
                )}`
            )
            .join("\n")
        : "(none)");

    const systemPrompt =
      `You are Brilliem AI Tutor. You ONLY help with Math or Science homework.\n` +
      `If the user asks anything outside math/science (gaming, programming, essays, general chat), refuse.\n\n` +
      `Return JSON that matches the provided schema exactly.\n\n` +
      `When solving:\n` +
      `- Always provide a clear, correct step-by-step solution.\n` +
      `- steps MUST be an array of short strings; each item is one step.\n` +
      `- The LAST step must compute/declare the final result.\n` +
      `- final_answer MUST match the result in the last step (including units).\n` +
      `- Double-check arithmetic and units before finalizing.\n` +
      `- Prefer exact values; if decimal, round reasonably (2 decimal places) and show the exact fraction if easy.\n` +
      `- Use plain text math (NO LaTeX/TeX). Do NOT output backslashes, $...$, \\( ... \\), \\frac, or \\text.\n` +
      `- Write fractions as a/b, multiplication as × or *, exponents as x^2, subscripts as v0 or v_0.\n` +
      `- If there isn't enough information, ask for the missing info.\n\n` +
      candidatesText;

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        allowed: { type: "boolean" },
        subject: { type: "string", enum: ["math", "science", "other"] },
        refusal_message: { type: "string" },
        final_answer: { type: "string" },
        steps: { type: "array", items: { type: "string" } },
        full_solution: { type: "string" },
        // MUST be indices into lessonCandidates (1-based), and can be empty.
        relevant_lesson_indices: { type: "array", items: { type: "integer", minimum: 1, maximum: 10 } },
      },
      required: ["allowed", "subject", "refusal_message", "final_answer", "steps", "full_solution", "relevant_lesson_indices"],
    };

    const messages: any[] = [{ role: "system", content: systemPrompt }];

    // Keep a little context (last 10 turns)
    const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
    for (const h of history) {
      if (!h || (h.role !== "user" && h.role !== "assistant")) continue;
      const c = safeString((h as any).content ?? (h as any).text, 4000);
      if (!c) continue;
      messages.push({ role: h.role, content: c });
    }

    // Current user message
    if (imageDataUrl) {
      const parts: any[] = [];
      if (userText) parts.push({ type: "text", text: userText });
      parts.push({ type: "image_url", image_url: { url: imageDataUrl } });
      messages.push({ role: "user", content: parts });
    } else {
      messages.push({ role: "user", content: userText });
    }

    // Prefer a vision-capable model if an image is included.
    const model =
      (imageDataUrl ? process.env.OPENAI_AI_TUTOR_VISION_MODEL : process.env.OPENAI_AI_TUTOR_MODEL) ||
      (imageDataUrl ? "gpt-4o-mini" : "gpt-4.1-mini");

    const out = await callOpenAIJson({
      model,
      messages,
      schemaName: "brilliem_stem_tutor",
      schema,
      maxTokens: 1100,
    });

    const allowed = !!out?.allowed;
    const subject = out?.subject === "science" ? "science" : out?.subject === "math" ? "math" : "other";

    if (!allowed || subject === "other") {
      const msg = safeString(out?.refusal_message) || "I can only help with math or science questions.";
      return jsonErr(msg, 200, true); // 200 so UI shows message inline without generic error
    }

    const steps = Array.isArray(out?.steps) ? out.steps.map((s: unknown) => safeString(s, 800)).filter(Boolean) : [];

    // The model sometimes produces steps that are correct but a final_answer that drifts.
    // Since your UI shows steps + a green "Final answer" box, we reconcile the final answer
    // to the last step whenever they disagree.
    const finalAnswerRaw =
      safeString(out?.final_answer, 4000) || "I couldn't generate a solution for that one—try rephrasing the question.";
    const derived = steps.length ? deriveFinalAnswerFromSteps(steps) : "";
    const finalAnswer = derived ? reconcileFinalAnswer(finalAnswerRaw, derived) : finalAnswerRaw;

    // Map lesson indices -> lessons
    const indices: number[] = Array.isArray(out?.relevant_lesson_indices)
      ? out.relevant_lesson_indices.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
      : [];
    const lessons = indices
      .map((n) => lessonCandidates[n - 1])
      .filter(Boolean)
      .slice(0, 4);

    const result: ApiOk["result"] = {
      finalAnswer,
      subject,
      lessons,
      // For stepwise chats, the UI uses this for the assistant "header" text.
      // We keep it neutral so the final answer only appears in the green box.
      displayText: steps.length ? "Step-by-step solution:" : finalAnswer,
    };

    // Step-by-step only
    if (steps.length) result.steps = steps;

    const payload: ApiOk = { ok: true, result };
    return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("AI Tutor route error:", err);
    return jsonErr("Request failed (500).", 500);
  }
}
