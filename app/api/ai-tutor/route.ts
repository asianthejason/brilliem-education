import { auth } from "@clerk/nextjs/server";
import { LESSONS, searchLessons, type Lesson } from "@/lib/LESSONS";
import { openaiChatCompletionJson } from "@/lib/openaiResponses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mode = "answer_only" | "full_solution" | "step_by_step";

type Body = {
  message?: string;
  mode?: Mode;
  imageDataUrl?: string | null; // e.g. data:image/png;base64,...
};

type TutorJson = {
  allowed: boolean;
  subject: "math" | "science" | "other";
  final_answer?: string;
  steps?: string[];
  full_solution?: string;
  reason_if_not_allowed?: string;
  relevant_lesson_urls?: string[];
};

function clampString(s: string, max = 4000) {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 80);
}

function pickLessonCandidates(query: string, k = 12): Lesson[] {
  // Prefer the app's built-in search function if present.
  const fromSearch = searchLessons({ query, limit: Math.max(1, Math.min(10, k)) });
  if (fromSearch.length) return fromSearch;

  // Fallback: lightweight scoring against the LESSONS array.
  const q = new Set(tokenize(query));
  const scored = LESSONS.map((l) => {
    const hay = `${l.title} ${(l.tags || []).join(" ")}`.toLowerCase();
    let score = 0;
    for (const w of q) {
      if (w.length < 3) continue;
      if (hay.includes(w)) score += 1;
    }
    return { l, score };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.l);

  return scored;
}

const tutorSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    allowed: { type: "boolean" },
    subject: { type: "string", enum: ["math", "science", "other"] },
    final_answer: { type: "string" },
    steps: { type: "array", items: { type: "string" } },
    full_solution: { type: "string" },
    reason_if_not_allowed: { type: "string" },
    relevant_lesson_urls: { type: "array", items: { type: "string" } },
  },
  required: ["allowed", "subject"],
} as const;

function modeInstructions(mode: Mode): string {
  switch (mode) {
    case "answer_only":
      return "Mode: Answer-only. Provide ONLY the final_answer (no steps, no full_solution).";
    case "full_solution":
      return "Mode: Full solution. Provide full_solution (clear explanation) and final_answer. Steps are optional.";
    case "step_by_step":
      return "Mode: Step-by-step. Provide steps as a short numbered list and final_answer. Full_solution is optional.";
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Body;
    const messageRaw = (body.message || "").trim();
    const mode = (body.mode || "step_by_step") as Mode;

    if (!messageRaw && !body.imageDataUrl) {
      return Response.json({ ok: false, error: "Missing message." }, { status: 400 });
    }

    const message = clampString(messageRaw || "Please answer the question shown in the image.");

    const candidates = pickLessonCandidates(message, 12);

    const system = [
      "You are Brilliem AI Tutor.",
      "You answer ALL math and science homework questions (including physics/chemistry/biology basics).",
      "If the user asks something outside math/science, set allowed=false, subject='other', and provide reason_if_not_allowed (brief).",
      modeInstructions(mode),
      "Important:",
      "- Be accurate and show units when relevant.",
      "- Do not invent lesson URLs. If choosing lessons, ONLY choose from the candidate list.",
      "Return a SINGLE JSON object that matches the provided JSON schema.",
    ].join("\n");

    const lessonCandidatesText =
      "Lesson candidates (choose up to 3; use exact URLs; do not invent new URLs):\n" +
      candidates
        .map((l, i) => `${i + 1}. ${l.title} | ${l.url} | tags: ${(l.tags || []).join(", ")}`)
        .join("\n");

    const userText = `${message}\n\n${lessonCandidatesText}`;

    // Chat content (supports optional image).
    const userContent: any =
      body.imageDataUrl && typeof body.imageDataUrl === "string"
        ? [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: body.imageDataUrl } },
          ]
        : userText;

    const result = await openaiChatCompletionJson<TutorJson>({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      schemaName: "brilliem_tutor",
      schema: tutorSchema,
      system,
      user: userContent,
    });

    const urls = Array.isArray(result.relevant_lesson_urls) ? result.relevant_lesson_urls : [];
    const relevantLessons = urls
      .map((u) => candidates.find((c) => c.url === u) || LESSONS.find((c) => c.url === u))
      .filter(Boolean)
      .slice(0, 3) as Lesson[];

    const payload = {
      ok: true,
      allowed: !!result.allowed,
      subject: result.subject || "other",
      mode,
      finalAnswer: (result.final_answer || "").trim(),
      steps: Array.isArray(result.steps) ? result.steps.map((s) => String(s)) : [],
      fullSolution: (result.full_solution || "").trim(),
      refusal: (result.reason_if_not_allowed || "").trim(),
      relevantLessons,
    };

    return Response.json(payload);
  } catch (err: any) {
    console.error("AI Tutor route error:", err?.message || err);
    return Response.json({ ok: false, error: err?.message || "Internal error." }, { status: 500 });
  }
}
