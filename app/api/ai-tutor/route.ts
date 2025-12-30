import { auth, clerkClient } from "@clerk/nextjs/server";
import { OpenAIHttpError, openaiResponsesCreate, extractOutputText } from "@/lib/openaiResponses";
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

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function buildUserContent(text: string, imageDataUrl?: string | null) {
  const content: any[] = [];
  const cleaned = text?.trim() || "";
  if (cleaned) content.push({ type: "input_text", text: cleaned });
  if (imageDataUrl) {
    // The Responses API input_image expects an `image_url` (URL or data URL).
    content.push({ type: "input_image", image_url: imageDataUrl });
  }
  if (content.length === 0) content.push({ type: "input_text", text: "(no text provided)" });
  return content;
}

async function getUserTier(userId: string): Promise<Tier> {
  // Clerk has had minor API shape differences across versions.
  const anyClient: any = clerkClient as any;
  const client = typeof anyClient === "function" ? await anyClient() : anyClient;
  const user = await client.users.getUser(userId);
  return ((user.unsafeMetadata?.tier as Tier) || "none") as Tier;
}

async function responsesCreateWithModelFallback(
  models: string[],
  payloadBase: Record<string, any>
): Promise<any> {
  const tried: string[] = [];
  let lastErr: any = null;

  for (const model of uniq(models).filter(Boolean)) {
    try {
      tried.push(model);
      return await openaiResponsesCreate({ ...payloadBase, model });
    } catch (err) {
      lastErr = err;

      // If it's not a model-related issue, still try the next model (helps with rollout/access differences).
      // We'll surface the final error message if all fail.
      continue;
    }
  }

  const extra = tried.length ? ` Tried models: ${tried.join(", ")}.` : "";
  if (lastErr instanceof Error) {
    throw new Error(`${lastErr.message}${extra}`);
  }
  throw new Error(`OpenAI request failed.${extra}`);
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

    const tier = await getUserTier(userId);
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

    const gateModels = uniq([
      process.env.OPENAI_AI_TUTOR_GATE_MODEL || "gpt-5-nano",
      "gpt-4o-mini",
      "gpt-4.1-mini",
    ]);

    const gateResp = await responsesCreateWithModelFallback(gateModels, {
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
            required: ["is_math", "problem", "topics", "grade_level"],
          },
        },
      },
      max_output_tokens: 400,
    });

    const gateText = extractOutputText(gateResp);
    const gate = safeJsonParse<Gate>(gateText);

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

    // 2) Lesson recommendations (simple keyword/tag search over your catalog).
    const lessonCandidates = searchLessons({ query: gate.problem, tags: gate.topics, limit: 5 });

    // 3) Solve with a stronger model + Code Interpreter enabled for accuracy.
    type Solve = {
      final_answer: string;
      full_solution?: string;
      steps?: string[];
      suggested_lessons: {
        title: string;
        url: string;
        difficulty?: string;
        why: string;
      }[];
    };

    const solverModels = uniq([
      process.env.OPENAI_AI_TUTOR_SOLVER_MODEL || "gpt-5-mini",
      "gpt-5",
      "gpt-4.1",
      "gpt-4o",
    ]);

    const styleHint =
      mode === "answer_only"
        ? "Give ONLY the final answer."
        : mode === "full_solution"
          ? "Give a clear full solution with the final answer."
          : "Teach step-by-step. Provide ONLY the FIRST step, and ask the student to reply 'next' for the next step.";

    const historyLines = history
      .map((h) => `${h.role === "user" ? "Student" : "Tutor"}: ${h.text}`)
      .join("\n");

    const solveResp = await responsesCreateWithModelFallback(solverModels, {
      instructions:
        "You are Brilliem AI Tutor. You only solve math problems. " +
        "Be accurate and check arithmetic. Use Code Interpreter internally when helpful. " +
        "When suggesting lessons, only use the provided lesson candidates. " +
        "Return JSON only.",
      input: [
        ...(historyLines
          ? [
              {
                role: "user",
                content: [{ type: "input_text", text: `Conversation so far:
${historyLines}` }],
              },
            ]
          : []),
        {
          role: "user",
          content: [{ type: "input_text", text: `Mode: ${mode}
${styleHint}` }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: `Problem: ${gate.problem}` }],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Lesson candidates (choose the best matches; do not invent new URLs):" +
                lessonCandidates
                  .map((l, i) =>
                    `${i + 1}. ${l.title} | ${l.url} | difficulty: ${l.difficulty || "unknown"} | tags: ${(l.tags || []).join(", ")}`
                  )
                  .join(""),
            },
          ],
        },
      ],
      tools: [
        {
          type: "code_interpreter",
          container: { type: "auto", memory_limit: "4g" },
        },
      ],
      text: {
        format: {
          type: "json_schema",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              final_answer: { type: "string" },
              full_solution: { type: "string" },
              steps: { type: "array", items: { type: "string" } },
              suggested_lessons: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    url: { type: "string" },
                    difficulty: { type: "string" },
                    why: { type: "string" },
                  },
                  required: ["title", "url", "why"],
                },
              },
            },
            required: ["final_answer", "suggested_lessons"],
          },
        },
      },
      max_output_tokens: mode === "answer_only" ? 300 : 900,
    });

    const solveText = extractOutputText(solveResp);
    const solve = safeJsonParse<Solve>(solveText);

    if (!solve || !solve.final_answer?.trim()) {
      return Response.json({ ok: false, message: "I had trouble generating a solution. Please try again." }, { status: 500 });
    }

    let assistantMessage = "";
    if (mode === "answer_only") {
      assistantMessage = solve.final_answer.trim();
    } else if (mode === "full_solution") {
      assistantMessage = (solve.full_solution || "").trim() || solve.final_answer.trim();
    } else {
      // stepwise
      if (Array.isArray(solve.steps) && solve.steps.length) {
        assistantMessage = solve.steps[0].trim();
      } else {
        assistantMessage = (solve.full_solution || "").trim() || solve.final_answer.trim();
      }
    }

    const lessons = (Array.isArray(solve.suggested_lessons) && solve.suggested_lessons.length
      ? solve.suggested_lessons
      : lessonCandidates.map((l) => ({ title: l.title, url: l.url, difficulty: l.difficulty }))
    ) as any[];

    return Response.json(
      {
        ok: true,
        result: {
          finalAnswer: solve.final_answer.trim(),
          steps: Array.isArray(solve.steps) ? solve.steps : undefined,
          lessons,
          displayText: assistantMessage,
        },
        meta: {
          gate_model_used: gateResp?.model,
          solver_model_used: solveResp?.model,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    // Log server-side so you can see details in Vercel Logs.
    console.error("AI Tutor route error:", err);

    const msg = err instanceof Error ? err.message : String(err);

    // Avoid leaking sensitive details; include OpenAI status codes if available.
    const extra =
      err && typeof err === "object" && (err as any).name === "OpenAIHttpError"
        ? { openai_status: (err as OpenAIHttpError).status }
        : {};

    return Response.json(
      {
        ok: false,
        message: `Request failed. ${msg}`,
        ...extra,
      },
      { status: 500 }
    );
  }
}
