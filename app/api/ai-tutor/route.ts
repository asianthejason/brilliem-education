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

function isMode(v: unknown): v is Mode {
  return v === "answer_only" || v === "full_solution" || v === "stepwise";
}

function safeString(v: unknown, max = 8000): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return s.length > max ? s.slice(0, max) : s;
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

    const mode: Mode = isMode(body.mode) ? body.mode : "answer_only";
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
      `You are Brilliem AI Tutor. You ONLY help with Math or Science homework.
` +
      `If the user asks anything outside math/science (gaming, programming, essays, general chat), refuse.

` +
      `Return JSON that matches the provided schema exactly.

` +
      `Always solve in STEP-BY-STEP mode:
` +
      `- Put the reasoning/work in steps[] as short, numbered-friendly lines.
` +
      `- final_answer must be concise (include units if applicable).
` +
      `- full_solution MUST be an empty string.

` +
      `Formatting rules (important):
` +
      `- ONLY wrap actual math expressions in LaTeX delimiters: inline \(...\) and display \[...\].
` +
      `- Do NOT use $...$ or $$...$$.
` +
      `- Never wrap normal English sentences in math delimiters.
` +
      `- For division/fractions, use \frac{a}{b} inside math delimiters so it renders as a fraction bar.
` +
      `- Units should be OUTSIDE math delimiters, e.g. \(54\) km/h.

` +
      `Lesson candidates (1-based indices). Choose up to 4 relevant lessons, or [] if none:
` +
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

    let finalAnswer = safeString(out?.final_answer, 4000) || "I couldn't generate a solution for that one—try rephrasing the question.";
    const steps = Array.isArray(out?.steps) ? out.steps.map((s: unknown) => safeString(s, 800)).filter(Boolean) : [];
    const fullSolution = safeString(out?.full_solution, 12000);

// If the model's final_answer disagrees with the computed result shown in the last step,
// prefer the last-step result. This helps avoid "correct steps, wrong final answer".
function stripMathDelims(s: string) {
  return (s || "")
    .replace(/\\\(|\\\)|\\\[|\\\]/g, "")
    .replace(/\$\$|\$/g, "")
    .trim();
}

function extractRhsAfterEquals(s: string): string {
  const t = String(s || "");
  const i = t.lastIndexOf("=");
  if (i === -1) return "";
  return t.slice(i + 1).trim().replace(/[.]+\s*$/g, "");
}

function canonicalizeNumberUnit(s: string): string {
  const raw = stripMathDelims(s);
  // Try to capture a leading number and optional unit.
  const m = raw.match(/^(-?\d+(?:[.,]\d+)?)(?:\s*([A-Za-z%°µ/\-]+.*))?$/);
  if (!m) return s.trim();
  const num = m[1].replace(/,/g, "");
  const unit = (m[2] || "").trim();
  return `\\(${num}\\)${unit ? " " + unit : ""}`;
}

if (steps.length) {
  const rhs = extractRhsAfterEquals(steps[steps.length - 1]);
  if (rhs) {
    const cand = canonicalizeNumberUnit(rhs);
    const faStripped = stripMathDelims(finalAnswer);
    const candStripped = stripMathDelims(cand);
    if (candStripped && faStripped && !faStripped.includes(candStripped)) {
      // Only override when it's clearly a different value.
      finalAnswer = cand;
    }
  }
}

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
      steps: steps.length ? steps : undefined,
      lessons,
      subject,
      displayText: finalAnswer,
    };

    const payload: ApiOk = { ok: true, result };
    return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("AI Tutor route error:", err);
    return jsonErr("Request failed (500).", 500);
  }
}
