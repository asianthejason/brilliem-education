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
    steps?: string[];
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

function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").replace(/[\u2018\u2019\u201C\u201D]/g, "");
}

function looksLikeMathExpr(s: string): boolean {
  const t = (s || "").trim();
  if (!t) return false;
  if (/\\(frac|sqrt|times|cdot|sum|int|pi|theta|mu|Delta|alpha|beta|gamma|sin|cos|tan|log|ln|mathrm|text)\b/.test(t)) return true;
  const hasDigit = /\d/.test(t);
  const hasOp = /[=<>+\-*/^_]/.test(t);
  const hasSlash = /\d\s*\/\s*\d/.test(t);
  return hasDigit && (hasOp || hasSlash);
}

function isMostlyWords(s: string): boolean {
  const t = (s || "").trim();
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  const digits = (t.match(/\d/g) || []).length;
  const ops = (t.match(/[=<>+\-*/^_]/g) || []).length;
  const hasLatexOp = /\\(frac|sqrt|times|cdot|sum|int)\b/.test(t);
  return letters >= 6 && ops === 0 && !hasLatexOp && digits <= 2;
}

function unwrapIfNotMath(text: string): string {
  let out = text;
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (m, inner) => (isMostlyWords(inner) ? inner : m));
  out = out.replace(/\\\[(\s*[\s\S]*?\s*)\\\]/g, (m, inner) => (isMostlyWords(inner) ? inner : m));
  return out;
}

function restoreJsonEscapedLatex(text: string): string {
  // If the model outputs LaTeX backslashes unescaped inside JSON, sequences like "\frac" are interpreted as "\f" (form-feed) + "rac"
  // and "\theta" becomes "\t" (tab) + "heta". Restore those control characters back into a visible backslash + letter.
  return (text || "")
    .replace(/\u000c(?=[A-Za-z])/g, "\\f")
    .replace(/\u0009(?=[A-Za-z])/g, "\\t")
    .replace(/\u0008(?=[A-Za-z])/g, "\\b")
    .replace(/\u000d(?=[A-Za-z])/g, "\\r");
}

function wrapBareTeXInPlainSegments(text: string): string {
  const mathRe = /\\\((?:[\s\S]*?)\\\)|\\\[(?:\s*[\s\S]*?\s*)\\\]/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;

  const processPlain = (seg: string) => {
    let s = seg;

    // Fix common lost-backslash TeX commands like "frac{...}{...}" or "sqrt{...}"
    s = s.replace(/(^|[^\\])frac\{/g, "$1\\frac{");
    s = s.replace(/(^|[^\\])sqrt\{/g, "$1\\sqrt{");

    // Wrap bare \frac{a}{b} so it renders with a horizontal bar.
    s = s.replace(/\\frac\{[^{}]+\}\{[^{}]+\}/g, (f) => `\\(${f}\\)`);

    // Wrap simple numeric fractions like 3/4 -> \(\frac{3}{4}\)
    s = s.replace(/\b(\d{1,4})\s*\/\s*(\d{1,4})\b/g, (_m, a, b) => `\\(\\frac{${a}}{${b}}\\)`);

    return s;
  };

  while ((m = mathRe.exec(text))) {
    const start = m.index ?? 0;
    out += processPlain(text.slice(last, start));
    out += m[0]; // keep existing math blocks untouched
    last = start + m[0].length;
  }
  out += processPlain(text.slice(last));
  return out;
}

function normalizeTutorOutput(text: string): string {
  if (!text) return "";
  let out = restoreJsonEscapedLatex(String(text));

  // Strip control characters that can appear when backslashes are not escaped correctly in JSON
  // (e.g. "\times" -> tab + "imes"). Keep newlines, but remove other non-printing chars.
  out = out.replace(/\u00ad/g, ""); // soft hyphen
  out = out.replace(/\t/g, " ");
  out = out.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

  // Convert $$...$$ to \[...\], $...$ to \( ... \) (only if it really looks like math)
  out = out.replace(/\$\$([\s\S]*?)\$\$/g, (m, inner) => (looksLikeMathExpr(inner) ? `\\[${inner}\\]` : inner));
  out = out.replace(/\$([^\n$]{1,300}?)\$/g, (m, inner) => (looksLikeMathExpr(inner) ? `\\(${inner}\\)` : inner));

  // Avoid \text{...} in outputs; units should be outside math.
  out = out.replace(/\\text\{([^}]*)\}/g, "$1");

  // If delimiters are incorrectly wrapping mostly-english, unwrap.
  out = unwrapIfNotMath(out);

  // Ensure bare fractions render nicely (and keep non-math words as plain text).
  out = wrapBareTeXInPlainSegments(out);

  return out.trim();
}


function cleanStepsForDisplay(steps: string[]): string[] {
  const raw = Array.isArray(steps) ? steps : [];
  const cleaned = raw
    .map((s) => normalizeTutorOutput(safeString(s, 1200)))
    // Remove any leading numbering the model might include (UI already numbers steps)
    .map((s) => s.replace(/^\s*\d+[\).:\-]\s*/, "").trim())
    // Remove any "Final answer:" label, if the model includes it
    .map((s) => s.replace(/^\s*final\s+(?:answer|result)\s*[:\-]\s*/i, "").trim())
    .filter(Boolean);

  // If the model produced a redundant trailing answer-only step, drop it when it's already contained in the previous step.
  if (cleaned.length >= 2) {
    const last = cleaned[cleaned.length - 1]!;
    const prev = cleaned[cleaned.length - 2]!;
    const lastPlain = normalizeForCompare(stripMathDelimsAndTex(last));
    const prevPlain = normalizeForCompare(stripMathDelimsAndTex(prev));

    if (lastPlain && prevPlain && (prevPlain === lastPlain || prevPlain.includes(lastPlain))) {
      cleaned.pop();
    }
  }

  // Remove consecutive duplicates after normalization
  const out: string[] = [];
  let prevPlain = "";
  for (const s of cleaned) {
    const p = normalizeForCompare(stripMathDelimsAndTex(s));
    if (p && p === prevPlain) continue;
    out.push(s);
    prevPlain = p;
  }
  return out;
}

function stripMathDelimsAndTex(s: string): string {
  let out = s || "";
  // Remove MathJax delimiters
  out = out.replace(/\\\(|\\\)|\\\[|\\\]/g, "");

  // Common TeX wrappers
  out = out.replace(/\\text\{([^}]*)\}/g, "$1");
  out = out.replace(/\\mathrm\{([^}]*)\}/g, "$1");

  // Convert fractions to a comparable plain form
  // e.g. \frac{41}{28} -> 41/28
  out = out.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1/$2");

  // Operators
  out = out.replace(/\\times/g, "×");
  out = out.replace(/\\cdot/g, "·");

  // Remove remaining TeX backslash commands (best-effort)
  out = out.replace(/\\[a-zA-Z]+/g, "");

  // Remove leftover braces and normalize whitespace
  out = out.replace(/[{}]/g, "");
  out = out.replace(/\s+/g, " ").trim();
  return out;
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

    const mode: Mode = "stepwise"; // fixed: step-by-step only (mode selection removed)
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
      `You are StemX Academy AI Tutor. You ONLY help with Math or Science homework.
` +
      `Science includes physics, chemistry, biology, earth/space science, and science/technology history when it is relevant to a science class (discoveries, inventions, experiments, scientific devices).
` +
      `If the user asks anything outside math/science (gaming, programming, essays, general chat), refuse.
` +
      `Safety: you may discuss scientific concepts and historical facts at a high level, but do NOT provide instructions to build weapons or to harm people.

` +
      `Return JSON that matches the provided schema exactly.

` +
      `When solving:
` +
      `- Always respond with a clear, correct step-by-step solution.
` +
      `- steps MUST be an array of short strings; each item is one step.
` +
      `- The LAST step must compute/declare the final result.
` +
      `- Do NOT add an extra "Final answer" line/step.
` +
      `- Do NOT label any step with "Final answer:" (just state the result naturally).
` +
      `- If there are multiple valid answers/solutions, include ALL of them in the last step.
` +
      `- Double-check arithmetic and units before finalizing.
` +
      `- Prefer exact values; if decimal, round reasonably (2 decimal places) and show the exact fraction if easy.
` +
      `- Only use MathJax LaTeX for *math expressions*, wrapped with inline \\(...\\) or display \\[...\\].
- IMPORTANT: You are returning JSON. Every backslash must be escaped as two backslashes.
  Example: write "\\frac{1}{2}" and "\\(\\frac{1}{2}\\)" (NOT "\\frac{1}{2}").
- NEVER wrap normal words/sentences in math delimiters.
- Do NOT use $...$ or $$...$$ delimiters.
- For division/fractions, use \\frac{a}{b} inside a math delimiter so it renders with a horizontal fraction bar.
- Put units (km/h, m/s, N, kg, s) outside math delimiters whenever possible.
` +
      `- Do not put LaTeX inside code fences.
` +
      `- If there isn\'t enough information, ask for the missing info.

` +
      candidatesText;

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        allowed: { type: "boolean" },
        subject: { type: "string", enum: ["math", "science", "other"] },
        refusal_message: { type: "string" },
        steps: { type: "array", items: { type: "string" } },
        // MUST be indices into lessonCandidates (1-based), and can be empty.
        relevant_lesson_indices: {
          type: "array",
          items: {
            type: "integer",
            minimum: 1,
            maximum: Math.max(1, lessonCandidates.length),
          },
        },
      },
      required: ["allowed", "subject", "refusal_message", "steps", "relevant_lesson_indices"],
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
      schemaName: "stemx_stem_tutor",
      schema,
      maxTokens: 1100,
    });

    const allowed = !!out?.allowed;
    const subject = out?.subject === "science" ? "science" : out?.subject === "math" ? "math" : "other";

    if (!allowed || subject === "other") {
      const msg = safeString(out?.refusal_message) || "I can only help with math or science questions.";
      return jsonErr(msg, 200, true); // 200 so UI shows message inline without generic error
    }

    const noStepsMsg = "I couldn't generate a step-by-step solution for that one—try rephrasing the question.";
    const steps: string[] = Array.isArray(out?.steps)
      ? out.steps.map((s: unknown) => safeString(s, 900)).filter(Boolean)
      : [];

    if (!steps.length) return jsonErr(noStepsMsg, 200);


    // Map lesson indices -> lessons
    const indices: number[] = Array.isArray(out?.relevant_lesson_indices)
      ? out.relevant_lesson_indices.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
      : [];
    const lessons = indices
      .map((n) => lessonCandidates[n - 1])
      .filter(Boolean)
      .slice(0, 4);

    const stepsOut = cleanStepsForDisplay(steps);

    const result: ApiOk["result"] = {
      subject,
      lessons,
      displayText: "",
      steps: stepsOut,
    };

    const payload: ApiOk = { ok: true, result };
    return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("AI Tutor route error:", err);
    return jsonErr("Request failed (500).", 500);
  }
}

