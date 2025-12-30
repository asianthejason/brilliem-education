import { auth, clerkClient } from "@clerk/nextjs/server";
import { openaiResponsesCreate, extractOutputText } from "@/lib/openaiResponses";
import { searchLessons } from "@/lib/lessonCatalog";

type Mode = "answer_only" | "full_solution" | "stepwise";
type Tier = "none" | "free" | "lessons" | "lessons_ai";

type HistoryItem = { role: "user" | "assistant"; text: string };

type Body = {
  mode?: Mode;
  text?: string;
  imageDataUrl?: string | null;
  history?: HistoryItem[];
};

function isMode(x: any): x is Mode {
  return x === "answer_only" || x === "full_solution" || x === "stepwise";
}

function clampStr(s: string, maxChars: number) {
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars);
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}


async function openaiWithSchemaFallback(payload: any) {
  try {
    return await openaiResponsesCreate(payload);
  } catch (e: any) {
    const msg = String(e?.message || "");
    // If the API complains about schema format parameters, retry without structured output.
    if (msg.includes("text.format.name") || msg.includes("text.format")) {
      const { text, ...rest } = payload || {};
      return await openaiResponsesCreate(rest);
    }
    throw e;
  }
}

function buildUserContent(text: string, imageDataUrl?: string | null) {
  const content: any[] = [];
  const cleaned = text?.trim() || "";
  if (cleaned) content.push({ type: "input_text", text: cleaned });
  if (imageDataUrl) {
    content.push({ type: "input_image", image_url: imageDataUrl });
  }
  if (content.length === 0) content.push({ type: "input_text", text: "(no text provided)" });
  return content;
}

export async function POST(req: Request) {
  try {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => null)) as Body | null;
  const mode: Mode = isMode(body?.mode) ? body!.mode! : "stepwise";

  // Keep requests bounded for serverless.
  const text = clampStr(String(body?.text || ""), 4000);
  const imageDataUrl = body?.imageDataUrl ? String(body.imageDataUrl) : null;
  const history = Array.isArray(body?.history)
    ? (body!.history!
        .filter((h) => h && (h.role === "user" || h.role === "assistant") && typeof h.text === "string")
        .slice(-8)
        .map((h) => ({ role: h.role, text: clampStr(h.text, 2000) })) as HistoryItem[])
    : ([] as HistoryItem[]);

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const tier = ((user.unsafeMetadata?.tier as Tier) || "none") as Tier;
  if (tier !== "lessons_ai") {
    return new Response("Forbidden", { status: 403 });
  }

  // 1) Guardrail: math-only classification + best-effort transcription.
  type Gate = {
    is_math: boolean;
    problem: string;
    topics: string[];
    grade_level: "elementary" | "middle" | "high" | "university" | "unknown";
    reason_if_not_math?: string;
  };

  const gateModel = process.env.OPENAI_AI_TUTOR_GATE_MODEL || "gpt-4o-mini";

  const gateResp = await openaiWithSchemaFallback({
    model: gateModel,
    instructions:
      "You are a strict classifier for a math-only tutoring app. " +
      "If the user provides an image, read it and transcribe the math problem. " +
      "Return JSON only. If the request is not a math problem (including non-math homework, coding, writing, general chat), set is_math=false.",
    input: [
      {
        role: "user",
        content: buildUserContent(text, imageDataUrl),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "math_gate",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            is_math: { type: "boolean" },
            problem: { type: "string" },
            topics: { type: "array", items: { type: "string" } },
            grade_level: {
              type: "string",
              enum: ["elementary", "middle", "high", "university", "unknown"],
            },
            reason_if_not_math: { type: "string" },
          },
          required: ["is_math", "problem", "topics", "grade_level", "reason_if_not_math"],
        },
      },
    },
  });

  const gateText = extractOutputText(gateResp);
  const gate = safeJsonParse<Gate>(gateText);

  // If the gate returned an empty problem but the user typed text, fall back to the raw text.
  if (gate && (!gate.problem || !gate.problem.trim()) && text.trim()) {
    gate.problem = text.trim();
  }

  if (!gate || !gate.problem?.trim()) {
    return Response.json(
      { ok: false, message: "I couldn't read that. Try typing the question or uploading a clearer photo." },
      { status: 400 }
    );
  }

  if (!gate.is_math) {
    return Response.json(
      {
        ok: false,
        refusal: true,
        message:
          gate.reason_if_not_math?.trim() ||
          "I can only help with math questions. Please ask a math problem (or upload a photo of one).",
      },
      { status: 200 }
    );
  }

  // 2) Lesson recommendations (placeholder: keyword search).
  const lessonCandidates = searchLessons({ query: gate.problem, tags: gate.topics, limit: 5 });

  // 3) Solve with a stronger model + Code Interpreter enabled for accuracy.
  type Solve = {
    finalAnswer: string;
    steps: string[];
    lessonRecommendations: Array<{ title: string; url: string; why?: string; difficulty?: string }>;
    displayText: string;
  };

  const solverModel = process.env.OPENAI_AI_TUTOR_SOLVER_MODEL || "gpt-4o-mini";

  const modeInstruction =
    mode === "answer_only"
      ? "Give ONLY the final answer (no steps)."
      : mode === "full_solution"
        ? "Explain clearly with step-by-step work, then give the final answer."
        : "Provide a short, numbered list of steps suitable for revealing one-at-a-time. Do not reveal the final answer until the end of the steps.";

  const lessonBlock = lessonCandidates.length
    ? `\n\nLesson candidates (choose up to 3 that match):\n${lessonCandidates
        .map((l) => `- ${l.title} (${l.url}) [tags: ${l.tags.join(", ")}]`)
        .join("\n")}`
    : "";

  const solverInstructions =
    "You are Brilliem's AI Tutor for math-only help.\n" +
    "Rules:\n" +
    "- Only answer math problems. If the user tries to change topic, refuse and ask for a math question.\n" +
    "- Be accurate. Use the python tool (Code Interpreter) to verify arithmetic/algebra whenever helpful.\n" +
    `- Output JSON that matches the schema exactly.\n\nMode: ${mode}. ${modeInstruction}` +
    lessonBlock;

  const inputMessages: any[] = [];

  // Provide brief prior context if present.
  for (const h of history) {
    const t = h.text?.trim();
    if (!t) continue;
    const partType = h.role === "assistant" ? "output_text" : "input_text";
inputMessages.push({
  role: h.role,
  content: [{ type: partType, text: t }],
});

  }

  // Current question (from gate transcription + optional original).
  inputMessages.push({
    role: "user",
    content: [{ type: "input_text", text: `Problem: ${gate.problem}` }],
  });

  const solveResp = await openaiWithSchemaFallback({
    model: solverModel,
    instructions: solverInstructions,
    input: inputMessages,
    text: {
      format: {
        type: "json_schema",
        name: "math_solution",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            finalAnswer: { type: "string" },
            steps: { type: "array", items: { type: "string" } },
            lessonRecommendations: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string" },
                  url: { type: "string" },
                  why: { type: "string" },
                  difficulty: { type: "string" },
                },
                required: ["title", "url", "why", "difficulty"],
              },
            },
            displayText: { type: "string" },
          },
          required: ["finalAnswer", "steps", "lessonRecommendations", "displayText"],
        },
      },
    },
  });

  const solveText = extractOutputText(solveResp);
  const solved = safeJsonParse<Solve>(solveText);

  if (!solved || !solved.finalAnswer) {
    return Response.json({ ok: false, message: "I couldn't generate a solution for that one—try rephrasing the question." }, { status: 500 });
  }

  const lessons = (solved.lessonRecommendations || []).slice(0, 3);

  return Response.json({
    ok: true,
    result: {
      finalAnswer: solved.finalAnswer,
      steps: solved.steps || [],
      lessons,
      displayText: solved.displayText,
    },
  });

  } catch (e: any) {
    const msg = e?.message || "AI Tutor route error";
    console.error("AI Tutor route error:", msg);
    return Response.json({ ok: false, message: msg }, { status: 500 });
  }
}
