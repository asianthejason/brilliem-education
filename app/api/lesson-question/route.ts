import { auth, clerkClient } from "@clerk/nextjs/server";
import { GRADES_7_TO_12 } from "@/lib/gradeCatalog";
import { openaiChatCompletionJson } from "@/lib/openaiResponses";
import type { Question } from "@/lib/questionBank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Tier = "none" | "free" | "lessons" | "lessons_ai";

type Body = {
  lessonId?: string;
  recentPrompts?: string[];
};

type ApiOk = { ok: true; question: Question };
type ApiErr = { ok: false; message: string };

function json(body: ApiOk | ApiErr, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeString(v: unknown, max = 800): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return s.length > max ? s.slice(0, max) : s;
}

function nrm(s: string) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/,/g, "");
}

function escapeHtml(s: string) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getUserTier(userId: string): Promise<Tier> {
  // clerkClient can be a function (newer versions) or an object (older versions)
  const client: any = typeof clerkClient === "function" ? await clerkClient() : clerkClient;
  const user = await client.users.getUser(userId);
  const tier = (user?.unsafeMetadata?.tier as Tier | undefined) ?? "none";
  return tier;
}

function findLesson(lessonId: string) {
  for (const g of GRADES_7_TO_12) {
    for (const u of g.units) {
      const l = u.lessons.find((x) => x.id === lessonId);
      if (l) return { grade: g, unit: u, lesson: l };
    }
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return json({ ok: false, message: "Unauthorized" }, 401);

    const tier = await getUserTier(userId);
    if (tier !== "lessons_ai") {
      return json(
        { ok: false, message: "AI question generation is only available on the Lessons + AI Tutor plan." },
        403
      );
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    const lessonId = safeString(body?.lessonId, 120);
    const recentPrompts = Array.isArray(body?.recentPrompts)
      ? body!.recentPrompts.map((p) => safeString(p, 220)).filter(Boolean).slice(-10)
      : [];

    if (!lessonId) return json({ ok: false, message: "Missing lessonId" }, 400);

    const ctx = findLesson(lessonId);
    if (!ctx) return json({ ok: false, message: "Unknown lesson" }, 400);

    const system =
      "You generate ONE Grade 7 math practice question at a time. " +
      "Keep it short and friendly. " +
      "Return JSON that matches the schema exactly. " +
      "The prompt must be plain text with optional **bold** (markdown). " +
      "No HTML. No images. No multi-part questions. " +
      "The answer must be short (a number, yes/no, or a comma-separated list). " +
      "The reasoning must be clear and 2–5 sentences. ";

    const lessonTitle = `${ctx.grade.label} • ${ctx.unit.title} • ${ctx.lesson.title}`;

    const user =
      `Lesson: ${lessonTitle}\n` +
      `Goal: create a NEW practice question for this lesson.\n` +
      (recentPrompts.length
        ? `Avoid making a question too similar to these recent prompts:\n- ${recentPrompts.join("\n- ")}\n`
        : "") +
      "Output fields:\n" +
      "- prompt: the question to show the student\n" +
      "- answer: the exact correct answer string\n" +
      "- acceptedAnswers: optional list of alternate correct answers\n" +
      "- reasoning: explanation shown after answering\n" +
      "- inputPlaceholder: optional, e.g. 'yes/no' or 'comma-separated'\n";

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        prompt: { type: "string", minLength: 5, maxLength: 500 },
        answer: { type: "string", minLength: 1, maxLength: 80 },
        acceptedAnswers: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 80 },
          minItems: 0,
          maxItems: 6,
        },
        reasoning: { type: "string", minLength: 10, maxLength: 900 },
        inputPlaceholder: { type: "string", minLength: 0, maxLength: 60 },
      },
      required: ["prompt", "answer", "reasoning"],
    };

    const model = process.env.OPENAI_LESSON_QUESTION_MODEL || "gpt-4.1-mini";

    const out = await openaiChatCompletionJson<{
      prompt: string;
      answer: string;
      acceptedAnswers?: string[];
      reasoning: string;
      inputPlaceholder?: string;
    }>({
      model,
      system,
      user,
      schemaName: "brilliem_lesson_question",
      schema,
      temperature: 0.3,
    });

    const id = `ai-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

    // Safety: ensure prompt cannot inject HTML into the client.
    const promptSafe = escapeHtml(String(out.prompt || ""));

    const q: Question = {
      id,
      lessonId,
      prompt: promptSafe,
      answer: nrm(String(out.answer || "")),
      acceptedAnswers: Array.isArray(out.acceptedAnswers) ? out.acceptedAnswers.map((a) => nrm(String(a))) : undefined,
      reasoning: String(out.reasoning || "").trim(),
      source: "ai",
      inputPlaceholder: out.inputPlaceholder ? String(out.inputPlaceholder).slice(0, 60) : undefined,
    };

    if (!q.prompt || !q.answer || !q.reasoning) {
      return json({ ok: false, message: "Model returned an incomplete question." }, 502);
    }

    return json({ ok: true, question: q }, 200);
  } catch (e: any) {
    return json({ ok: false, message: e?.message || "Failed to generate question" }, 500);
  }
}
