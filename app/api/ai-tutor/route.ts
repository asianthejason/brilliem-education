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

function buildUserContent(text: string, imageDataUrl?: string | null) {
  const content: any[] = [];
  const t = (text || "").trim();
  if (t) content.push({ type: "input_text", text: clampStr(t, 8000) });
  if (imageDataUrl) content.push({ type: "input_image", image_url: imageDataUrl });
  return content;
}

async function responsesCreateWithModelFallback(
  models: string[],
  payload: Omit<Parameters<typeof openaiResponsesCreate>[0], "model">
) {
  let lastErr: unknown = null;

  for (const m of models) {
    try {
      return await openaiResponsesCreate({ ...payload, model: m });
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error("OpenAI request failed");
}

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Body;

    const mode: Mode =
      body.mode === "answer_only" || body.mode === "full_solution" || body.mode === "stepwise" ? body.mode : "stepwise";
    const text = typeof body.text === "string" ? body.text : "";
    const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : null;

    const history: HistoryItem[] = Array.isArray(body.history)
      ? (body.history
          .filter((h: any) => h && (h.role === "user" || h.role === "assistant") && typeof h.text === "string")
          .slice(-8)
          .map((h: any) => ({ role: h.role, text: clampStr(h.text, 2000) })) as HistoryItem[])
      : ([] as HistoryItem[]);

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const tier = ((user.unsafeMetadata?.tier as Tier) || "none") as Tier;
    if (tier !== "lessons_ai") return new Response("Forbidden", { status: 403 });

    // 1) Guardrail: STEM-only classification (math + science) + best-effort transcription.
    type Gate = {
      is_stem: boolean;
      subject: "math" | "science" | "unknown";
      problem: string;
      topics: string[];
      grade_level: "elementary" | "middle" | "high" | "university" | "unknown";
      reason_if_not_stem: string;
    };

    const gateModels = (process.env.OPENAI_AI_TUTOR_GATE_MODELS ||
      process.env.OPENAI_AI_TUTOR_GATE_MODEL ||
      "gpt-4.1-mini,gpt-4o-mini")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const gateResp = await responsesCreateWithModelFallback(gateModels, {
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are a strict classifier for Brilliem's AI Tutor. Decide if the user's request is STEM homework help (math OR science).\n" +
                "Allow: math problems; physics/chemistry/biology/earth science questions; unit conversions; lab questions; scientific method.\n" +
                "Reject: gaming, relationships, history/english essays, creative writing, coding help, general chat.\n" +
                "If STEM, extract the clean problem statement. If the image is unreadable, set is_stem=false and explain why.\n" +
                "Return JSON only that matches the schema exactly.",
            },
          ],
        },
        {
          role: "user",
          content: buildUserContent(text, imageDataUrl),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "stem_gate",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              is_stem: { type: "boolean" },
              subject: { type: "string", enum: ["math", "science", "unknown"] },
              problem: { type: "string" },
              topics: { type: "array", items: { type: "string" } },
              grade_level: { type: "string", enum: ["elementary", "middle", "high", "university", "unknown"] },
              reason_if_not_stem: { type: "string" },
            },
            required: ["is_stem", "subject", "problem", "topics", "grade_level", "reason_if_not_stem"],
          },
        },
      },
    });

    const gateText = extractOutputText(gateResp);
    const gate = safeJsonParse<Gate>(gateText);

    if (!gate || !gate.problem?.trim()) {
      return Response.json(
        { ok: false, message: "I couldn't read that. Try typing the question or uploading a clearer photo.", refusal: false },
        { status: 400 }
      );
    }

    if (!gate.is_stem) {
      return Response.json(
        {
          ok: false,
          refusal: true,
          message: gate.reason_if_not_stem || "I can only help with math or science questions. Please ask a math/science homework question.",
        },
        { status: 200 }
      );
    }

    // 2) Solve with strict JSON output (and recommend lessons when relevant).
    const lessonCandidates = searchLessons({ query: gate.problem, tags: gate.topics || [], limit: 12 });

    type Solve = {
      finalAnswer: string;
      steps: string[];
      lessonRecommendations: Array<{ title: string; url: string; why: string; difficulty: string }>;
      displayText: string;
    };

    const solverModels = (process.env.OPENAI_AI_TUTOR_SOLVER_MODELS ||
      process.env.OPENAI_AI_TUTOR_SOLVER_MODEL ||
      "gpt-5-mini,gpt-4.1-mini,gpt-4o-mini")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const modeInstruction =
      mode === "answer_only"
        ? "Give ONLY the final answer (no steps)."
        : mode === "full_solution"
          ? "Explain clearly with step-by-step work, then give the final answer."
          : "Provide a short, numbered list of steps suitable for a student. Do not reveal the final answer until the end of the steps.";

    const lessonBlock = lessonCandidates.length
      ? `\n\nLesson candidates (choose up to 3 that match; do not invent URLs):\n${lessonCandidates
          .map((l) => `- ${l.title} (${l.url}) [difficulty: ${l.difficulty || "unknown"}; tags: ${(l.tags || []).join(", ")}]`)
          .join("\n")}`
      : "";

    const solverInstructions =
      "You are Brilliem's AI Tutor for STEM homework help (math + science).\n" +
      "Rules:\n" +
      "- Only answer math or science questions. If it's not math/science, refuse briefly and ask for a math/science question.\n" +
      "- Be accurate. Use the code interpreter tool to verify arithmetic/unit conversions and to check your final numeric answer when helpful.\n" +
      "- Keep explanations student-friendly and concise.\n" +
      "- Output JSON that matches the schema exactly.\n\n" +
      `Mode: ${mode}. ${modeInstruction}` +
      lessonBlock;

    const inputMessages: any[] = [];

    for (const h of history) {
      const t = h.text?.trim();
      if (!t) continue;
      inputMessages.push({ role: h.role, content: [{ type: "input_text", text: t }] });
    }

    inputMessages.push({ role: "user", content: [{ type: "input_text", text: `Problem: ${gate.problem}` }] });

    const solvePayload = {
      instructions: solverInstructions,
      input: inputMessages,
      tools: [{ type: "code_interpreter", container: { type: "auto", memory_limit: "1g" } }],
      text: {
        format: {
          type: "json_schema",
          name: "stem_solution",
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
    } as const;

    const solveResp = await responsesCreateWithModelFallback(solverModels, solvePayload);
    const solveText = extractOutputText(solveResp);
    let solved = safeJsonParse<Solve>(solveText);

    // Rarely, upstream truncation can break JSON. Retry once (same payload, different model order).
    if (!solved || !solved.finalAnswer) {
      const retryResp = await responsesCreateWithModelFallback([...solverModels].reverse(), solvePayload);
      const retryText = extractOutputText(retryResp);
      solved = safeJsonParse<Solve>(retryText);
    }

    if (!solved || !solved.finalAnswer) {
      return Response.json({ ok: false, message: "I couldn't generate a solution for that one—try rephrasing the question." }, { status: 500 });
    }

    return Response.json({
      ok: true,
      result: {
        finalAnswer: solved.finalAnswer,
        steps: solved.steps || [],
        lessons: (solved.lessonRecommendations || []).slice(0, 3),
        displayText: solved.displayText,
      },
    });
  } catch (err: any) {
    console.error("AI Tutor route error:", err?.message || err);
    return Response.json({ ok: false, message: String(err?.message || "Request failed") }, { status: 500 });
  }
}
