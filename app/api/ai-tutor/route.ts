import OpenAI from "openai";
import { auth } from "@clerk/nextjs/server";
import { searchLessons } from "@/lib/lessonCatalog";

export const runtime = "nodejs";

type Mode = "answer_only" | "full_solution" | "step_by_step";

type Body = {
  message?: string;
  mode?: Mode;
  chatId?: string;
};

type LessonCard = { title: string; url: string; why?: string };

type GateResult = {
  allowed: boolean;
  domain: "math" | "science" | "other";
  confidence: number;
};

type ModelResult = {
  rejected: boolean;
  rejectionMessage: string;
  finalAnswer: string;
  steps: string[];
  fullSolution: string;
  latexUsed: boolean;
};

function repairLatexControlChars(s: string) {
  // Reverse common JSON escape conversions that can eat LaTeX backslashes:
  // \frac -> \f + rac (formfeed control char)
  return s
    .replace(/\u000c/g, "\\\\f")
    .replace(/\u0008/g, "\\\\b")
    .replace(/\u0009/g, "\\\\t")
    .replace(/\u000b/g, "\\\\v")
    .replace(/\u000d/g, "\\\\r");
}

function normalizeOutput(s: string) {
  // Keep this conservative: only repair control chars. Client will handle delimiter normalization.
  return repairLatexControlChars(String(s ?? ""));
}

function likelyMathOrScience(text: string) {
  const t = text.toLowerCase();
  // quick accepts
  if (/[0-9]/.test(t)) return true;
  if (/[=^_+\-*/]/.test(t)) return true;
  const keywords = [
    "planet",
    "sun",
    "moon",
    "saturn",
    "jupiter",
    "mars",
    "venus",
    "mercury",
    "earth",
    "solar",
    "orbit",
    "gravity",
    "physics",
    "chemistry",
    "biology",
    "cell",
    "atom",
    "molecule",
    "electron",
    "proton",
    "neutron",
    "force",
    "energy",
    "velocity",
    "acceleration",
    "mass",
    "density",
    "voltage",
    "current",
    "circuit",
    "thermodynamics",
    "photosynthesis",
    "evolution",
    "geology",
    "rock",
    "earthquake",
    "wave",
    "frequency",
    "period",
    "amplitude",
    "acid",
    "base",
    "ph",
    "stoichiometry",
  ];
  return keywords.some((k) => t.includes(k));
}

function systemGatePrompt() {
  return [
    "You classify whether a user question is about math OR science homework/help.",
    "Return JSON strictly matching the schema. If uncertain, allow it.",
    "Science includes astronomy, physics, chemistry, biology, earth science, engineering, and general science facts.",
  ].join("\n");
}

function systemSolvePrompt(mode: Mode) {
  return [
    "You are an AI tutor for math and science homework.",
    "Output must be VALID JSON and MUST match the schema exactly (no markdown, no code fences).",
    "Use clear reasoning. Follow the requested mode:",
    `- answer_only: ONLY the final answer (no steps, no explanation).`,
    `- step_by_step: concise numbered steps + final answer.`,
    `- full_solution: a thorough solution written in full sentences, with equations where helpful, plus the final answer.`,
    "",
    "IMPORTANT MATH FORMATTING:",
    "- Write math using LaTeX delimiters ONLY as \\( ... \\) for inline and \\[ ... \\] for display math (do NOT use $ or $$).",
    "- Because you are returning JSON, you MUST escape backslashes in LaTeX commands: write \\\\frac, \\\\sqrt, etc.",
    "",
    "If the question is NOT math or science, set rejected=true and give a short rejectionMessage.",
    `Requested mode: ${mode}`,
  ].join("\n");
}

function gateSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["allowed", "domain", "confidence"],
    properties: {
      allowed: { type: "boolean" },
      domain: { type: "string", enum: ["math", "science", "other"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
  } as const;
}

function solveSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["rejected", "rejectionMessage", "finalAnswer", "steps", "fullSolution", "latexUsed"],
    properties: {
      rejected: { type: "boolean" },
      rejectionMessage: { type: "string" },
      finalAnswer: { type: "string" },
      steps: { type: "array", items: { type: "string" } },
      fullSolution: { type: "string" },
      latexUsed: { type: "boolean" },
    },
  } as const;
}

async function chatJson<T>(
  openai: OpenAI,
  args: {
    model: string;
    system: string;
    user: string;
    schemaName: string;
    schema: any;
    temperature?: number;
  }
): Promise<T> {
  const completion = await openai.chat.completions.create({
    model: args.model,
    temperature: args.temperature ?? 0.2,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: args.schemaName,
        strict: true,
        schema: args.schema,
      },
    },
  });

  const content = completion.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(content) as T;
  } catch {
    // One retry with temperature 0 and extra instruction
    const retry = await openai.chat.completions.create({
      model: args.model,
      temperature: 0,
      messages: [
        { role: "system", content: args.system + "\nReturn ONLY valid JSON. No extra keys." },
        { role: "user", content: args.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: args.schemaName,
          strict: true,
          schema: args.schema,
        },
      },
    });

    const content2 = retry.choices?.[0]?.message?.content ?? "";
    return JSON.parse(content2) as T;
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Body;
    const userText = (body.message || "").trim();
    const mode: Mode = body.mode || "step_by_step";

    if (!userText) {
      return Response.json({ rejected: true, rejectionMessage: "Please type a question.", finalAnswer: "", steps: [], fullSolution: "", latexUsed: false });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL_AI_TUTOR || "gpt-4o-mini";

    // Gate (but be permissive; avoid false rejections)
    let allowed = likelyMathOrScience(userText);
    if (!allowed) {
      const gate = await chatJson<GateResult>(openai, {
        model,
        system: systemGatePrompt(),
        user: userText,
        schemaName: "ai_tutor_gate",
        schema: gateSchema(),
        temperature: 0,
      });

      // If uncertain, allow.
      if (gate.allowed) allowed = true;
      else {
        // Only reject if high confidence "other"
        allowed = !(gate.domain === "other" && gate.confidence >= 0.85);
      }
    }

    if (!allowed) {
      return Response.json({
        rejected: true,
        rejectionMessage: "I can only help with math or science homework. Please ask a math or science question.",
        finalAnswer: "",
        steps: [],
        fullSolution: "",
        latexUsed: false,
        lessons: [],
      });
    }

    // Lessons: pick top matches automatically
    const lessonCandidates = searchLessons({ query: userText, tags: [], limit: 3 });
    const lessons: LessonCard[] = lessonCandidates.map((l) => ({
      title: l.title,
      url: l.url,
      why: l.tags?.length ? `Tags: ${l.tags.slice(0, 4).join(", ")}` : "Relevant lesson",
    }));

    const result = await chatJson<ModelResult>(openai, {
      model,
      system: systemSolvePrompt(mode),
      user: userText,
      schemaName: "ai_tutor_result",
      schema: solveSchema(),
      temperature: 0.2,
    });

    // Normalize outputs
    const finalAnswer = normalizeOutput(result.finalAnswer);
    const steps = (result.steps || []).map((s) => normalizeOutput(s));
    const fullSolution = normalizeOutput(result.fullSolution);

    // Enforce mode shape (keeps UI consistent even if the model gets verbose)
    const shaped: ApiResponse = {
      rejected: !!result.rejected,
      rejectionMessage: result.rejectionMessage || "",
      finalAnswer: mode === "answer_only" ? finalAnswer : finalAnswer,
      steps: mode === "step_by_step" ? steps : [],
      fullSolution: mode === "full_solution" ? fullSolution : "",
      displayText: mode === "full_solution" ? fullSolution : mode === "answer_only" ? finalAnswer : "",
      lessons,
    };

    // If full_solution came back empty, fall back to joining steps (never 500)
    if (mode === "full_solution" && !shaped.fullSolution) {
      const joined = steps.length ? steps.map((s, i) => `${i + 1}. ${s}`).join("\n") : "";
      shaped.fullSolution = joined || finalAnswer;
      shaped.displayText = shaped.fullSolution;
    }

    // If answer_only accidentally came with steps/solution, hide it
    if (mode === "answer_only") {
      shaped.steps = [];
      shaped.fullSolution = "";
      shaped.displayText = finalAnswer;
    }

    return Response.json(shaped);
  } catch (err: any) {
    console.error("AI Tutor route error:", err);
    return new Response("Server error", { status: 500 });
  }
}
