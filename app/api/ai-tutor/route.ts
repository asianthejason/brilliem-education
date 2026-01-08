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

function looksLikeNumericOrMathAnswer(rawWithTex: string): boolean {
  const raw = String(rawWithTex || "").trim();
  if (!raw) return false;

  // Any explicit TeX/math delimiter strongly suggests this is quantitative.
  if (/\\\(|\\\[|\\frac\{|\\sqrt\{|\\times\b|\\div\b|\\cdot\b|\\sum\b|\\int\b/.test(raw)) return true;

  const plain = stripMathDelimsAndTex(raw);
  if (!plain) return false;

  // If it contains operators alongside digits, it's almost certainly math.
  if (/\d/.test(plain) && /[=<>+*/^]/.test(plain)) return true;

  // Plain numeric (optionally with unit).
  if (/^-?\d+(?:\.\d+)?(?:\s*[a-zA-Z°/%]+(?:\/[a-zA-Z°]+)?)?$/.test(plain)) return true;
  if (/^\d+\s*\/\s*\d+(?:\s*[a-zA-Z°/%]+(?:\/[a-zA-Z°]+)?)?$/.test(plain)) return true;

  return false;
}

function deriveFinalAnswerFromSteps(steps: string[]): string {
  const cleaned = (Array.isArray(steps) ? steps : [])
    .map((s) => safeString(s, 4000))
    .map((s) => s.replace(/^\s*(?:\d+[\).:\-]\s*)/, "").trim())
    .filter(Boolean);

  if (!cleaned.length) return "";

  const phraseRes: RegExp[] = [
    /\bfinal\s+(?:answer|result)\s*(?:is|:|-)?\s*/i,
    /\bfinal\s+answer\s*[:\-]\s*/i,
    /\banswer\s*[:\-]\s*/i,
    /\bstate\s+the\s+final\s+answer\s*(?:is|:|-)?\s*/i,
    /\btherefore\b[, ]*\s*(?:the\s+)?(?:final\s+)?(?:answer|result)\s*(?:is|:|-)?\s*/i,
    /\bso\b[, ]*\s*(?:the\s+)?(?:final\s+)?(?:answer|result)\s*(?:is|:|-)?\s*/i,
    /\bthe\s+(?:final\s+)?result\s*(?:is|:|-)?\s*/i,
    /\bthe\s+(?:final\s+)?answer\s*(?:is|:|-)?\s*/i,
    /\bwrite\s+(?:the\s+)?(?:sum|result|answer)\s+as\s*/i,
    /\bthe\s+sum\s+is\s*/i,
  ];

  const pickMathFromSegment = (segRaw: string, preferFirst: boolean): string => {
    if (!segRaw) return "";
    const seg = segRaw.trim();

    // If the answer is a named identifier (common in science/chemistry), preserve it.
    // Examples: "RDS-1", "H2SO4", "NaCl".
    const idMatches = [...seg.matchAll(/\b([A-Za-z]{1,6}\d{0,3}(?:-[A-Za-z0-9]{1,6})+)\b/g)];
    if (idMatches.length) {
      const chosen = idMatches[preferFirst ? 0 : idMatches.length - 1]![1];
      return chosen.replace(/^"|"$/g, "");
    }

    // If we have a mixed number like "10 \( \frac{5}{6} \)" capture it as one math expression.
    const mixedWrapped = seg.match(/\b(\d+)\s*\\\(\s*(\\frac\{[^{}]+\}\{[^{}]+\})\s*\\\)/);
    if (mixedWrapped) {
      const whole = mixedWrapped[1];
      const frac = mixedWrapped[2];
      return `\\(${whole} ${frac}\\)`;
    }

    // 1) MathJax-delimited expressions.
    const mathMatches = [...seg.matchAll(/\\\(([\s\S]*?)\\\)|\\\[(\s*[\s\S]*?\s*)\\\]/g)];
    if (mathMatches.length) {
      const lower = seg.toLowerCase();
      const alsoIdx = lower.search(/\b(?:also|alternatively)\b/);

      const candidates = mathMatches
        .map((m) => ({ full: m[0], idx: m.index ?? 0 }))
        .sort((a, b) => a.idx - b.idx);

      // If the sentence has "also ...", prefer the expression before "also"
      if (alsoIdx >= 0) {
        const before = candidates.filter((c) => c.idx < alsoIdx);
        if (before.length) return preferFirst ? before[0].full : before[before.length - 1].full;
      }

      return preferFirst ? candidates[0].full : candidates[candidates.length - 1].full;
    }

    // 2) TeX \frac{a}{b}
    const fracMatches = [...seg.matchAll(/\\frac\{[^{}]+\}\{[^{}]+\}/g)];
    if (fracMatches.length) {
      const frac = fracMatches[preferFirst ? 0 : fracMatches.length - 1]![0];
      // Capture mixed number like "10 \frac{5}{6}" if present just before
      const before = seg.slice(0, fracMatches[preferFirst ? 0 : fracMatches.length - 1]!.index ?? 0);
      const whole = before.match(/\b(\d+)\s*$/);
      if (whole) return `\\(${whole[1]} ${frac}\\)`;
      return `\\(${frac}\\)`;
    }

    // 3) Simple numeric fraction like 41/28
    const slashFracMatches = [...seg.matchAll(/\b(\d+)\s*\/\s*(\d+)\b/g)];
    if (slashFracMatches.length) {
      const m = slashFracMatches[preferFirst ? 0 : slashFracMatches.length - 1]!;
      const a = m[1];
      const b = m[2];
      const before = seg.slice(0, m.index ?? 0);
      const whole = before.match(/\b(\d+)\s*$/);
      if (whole) return `\\(${whole[1]} \\frac{${a}}{${b}}\\)`;
      return `\\(\\frac{${a}}{${b}}\\)`;
    }

    // 4) Last number (integer/decimal) with optional unit
    const numMatches = [...seg.matchAll(/(-?\d+(?:\.\d+)?)(?:\s*([a-zA-Z°/%]+(?:\/[a-zA-Z°]+)?)\b)?/g)];
    if (numMatches.length) {
      const chosen = numMatches[preferFirst ? 0 : numMatches.length - 1]!;
      const n = chosen[1];
      const unit = chosen[2];
      return (n + (unit ? ` ${unit}` : "")).trim();
    }

    return "";
  };

  const extractFromText = (s: string): string => {
    if (!s) return "";

    // If there's an '=', prefer whatever is after the last '='.
    const rhs = (() => {
      const idx = s.lastIndexOf("=");
      if (idx !== -1 && idx < s.length - 1) return s.slice(idx + 1).trim();
      return s;
    })();

    // Phrase-based: use the first expression after the phrase (avoids grabbing "... can also be written as ...")
    for (const re of phraseRes) {
      const m = re.exec(s);
      if (m && typeof m.index === "number") {
        const after = s.slice(m.index + m[0].length);
        const picked = pickMathFromSegment(after, true);
        if (picked) return picked;
      }
    }

    // Otherwise pick from RHS. Use also/alternatively heuristic to avoid grabbing the alternative.
    return pickMathFromSegment(rhs, false);
  };

  // Walk backwards to find the best "final/result/answer" phrasing; fall back to the last step.
  for (let i = cleaned.length - 1; i >= 0; i--) {
    const cand = extractFromText(cleaned[i]);
    if (cand) return cand;
  }

  return extractFromText(cleaned[cleaned.length - 1]);
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

function dedupeTrailingUnits(s: string): string {
  const t = s.trim();
  // e.g. "54 km/h km/h" -> "54 km/h"
  const m = t.match(/^(.+?)\b([a-zA-Z°/%]+(?:\/[a-zA-Z°]+)?)\s+\2\s*$/);
  if (m) return `${m[1].trim()} ${m[2]}`.trim();
  return t;
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
      `You are Brilliem AI Tutor. You ONLY help with Math or Science homework.
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
      `- final_answer MUST match the result in the last step (including units).
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
        final_answer: { type: "string" },
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
      required: ["allowed", "subject", "refusal_message", "final_answer", "steps", "relevant_lesson_indices"],
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

    let finalAnswer = normalizeTutorOutput(safeString(out?.final_answer, 4000)) || "I couldn't generate a solution for that one—try rephrasing the question.";
    let steps = Array.isArray(out?.steps) ? out.steps.map((s: unknown) => normalizeTutorOutput(safeString(s, 900))).filter(Boolean) : [];

    // If the model's final_answer drifts from the computed result in the last step, trust the last step.
    // IMPORTANT: Only auto-override when the answer is clearly quantitative.
    // Otherwise, science/history identifiers like "RDS-1" can be incorrectly reduced to "-1".
    const derived = deriveFinalAnswerFromSteps(steps);
    if (derived) {
      const aPlain = normalizeForCompare(stripMathDelimsAndTex(finalAnswer));
      const dPlain = normalizeForCompare(stripMathDelimsAndTex(derived));

      const finalIsQuant = looksLikeNumericOrMathAnswer(finalAnswer);
      const derivedIsQuant = looksLikeNumericOrMathAnswer(derived);

      const shouldOverride =
        !aPlain ||
        (subject === "math" && dPlain && aPlain !== dPlain) ||
        (subject === "science" && finalIsQuant && derivedIsQuant && dPlain && aPlain !== dPlain);

      if (shouldOverride) finalAnswer = normalizeTutorOutput(derived);
    }
    finalAnswer = dedupeTrailingUnits(finalAnswer);

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
      // Don’t echo the numeric answer in the bubble header; the UI shows it after the steps.
      displayText: "Step-by-step solution:",
      steps: steps.length ? steps : [finalAnswer].filter(Boolean),
    };

    const payload: ApiOk = { ok: true, result };
    return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("AI Tutor route error:", err);
    return jsonErr("Request failed (500).", 500);
  }
}

