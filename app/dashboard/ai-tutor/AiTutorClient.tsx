"use client";

import { useMemo, useRef, useState } from "react";

type Mode = "answer_only" | "full_solution" | "stepwise";

type LessonRec = {
  title: string;
  url: string;
  why?: string;
  difficulty?: string;
};

type ChatMsg =
  | { id: string; role: "user"; text?: string; imageDataUrl?: string }
  | {
      id: string;
      role: "assistant";
      text: string;
      steps?: string[];
      finalAnswer?: string;
      lessons?: LessonRec[];
      stepRevealCount?: number;
    };

type HistoryItem = { role: "user" | "assistant"; text: string };

type ApiResult = {
  finalAnswer: string;
  steps?: string[];
  lessons?: LessonRec[];
  displayText?: string;
};

type ApiResponse =
  | { ok: true; result: ApiResult }
  | { ok: false; message: string; refusal?: boolean };

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function modeLabel(m: Mode) {
  if (m === "answer_only") return "Answer only";
  if (m === "full_solution") return "Full solution";
  return "Step-by-step";
}

function isProbablyEmpty(s: string) {
  return s.trim().length === 0;
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

export function AiTutorClient() {
  const [mode, setMode] = useState<Mode>("stepwise");
  const [input, setInput] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    {
      id: uid(),
      role: "assistant",
      text: "Ask me a math question (type it, or upload a photo). I can do answer-only, full solutions, or step-by-step.",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const history: HistoryItem[] = useMemo(() => {
    // Send a short, text-only history to the server.
    const trimmed = messages
      .filter((m): m is Extract<ChatMsg, { role: "user" }> | Extract<ChatMsg, { role: "assistant" }> => true)
      .map((m) => ({
        role: m.role,
        text: m.role === "user" ? (m.text || "") : m.text,
      }))
      .filter((m) => !isProbablyEmpty(m.text));
    return trimmed.slice(-8);
  }, [messages]);

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!/^image\//.test(f.type)) {
      setError("Please upload an image file.");
      e.target.value = "";
      return;
    }

    // Keep this small-ish for serverless limits.
    if (f.size > 2.5 * 1024 * 1024) {
      setError("That image is a bit large. Please upload an image under ~2.5MB.");
      e.target.value = "";
      return;
    }

    setError(null);
    const dataUrl = await fileToDataUrl(f);
    setImageDataUrl(dataUrl);
  }

  function clearImage() {
    setImageDataUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function send() {
    setError(null);

    if (!imageDataUrl && isProbablyEmpty(input)) {
      setError("Type a math question or upload a photo.");
      return;
    }

    const userMsg: ChatMsg = { id: uid(), role: "user", text: input.trim() || undefined, imageDataUrl: imageDataUrl || undefined };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    clearImage();

    setBusy(true);
    try {
      const res = await fetch("/api/ai-tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          text: userMsg.text || "",
          imageDataUrl: userMsg.imageDataUrl || null,
          history,
        }),
      });

      const data = (await res.json().catch(() => null)) as ApiResponse | null;
      if (!data || !data.ok) {
        const msg = data?.message || `Request failed (${res.status}).`;
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            text: msg,
          },
        ]);
        return;
      }

      const r = data.result;

      if (mode === "stepwise" && r.steps && r.steps.length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            text: r.displayText || "Here’s the first step.",
            steps: r.steps,
            finalAnswer: r.finalAnswer,
            lessons: r.lessons,
            stepRevealCount: 1,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            text: r.displayText || r.finalAnswer,
            steps: r.steps,
            finalAnswer: r.finalAnswer,
            lessons: r.lessons,
          },
        ]);
      }
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          text: e?.message || "Something went wrong.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function revealNext(msgId: string) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.role !== "assistant") return m;
        if (m.id !== msgId) return m;
        const total = m.steps?.length || 0;
        const current = m.stepRevealCount || 0;
        const next = Math.min(total, current + 1);
        return { ...m, stepRevealCount: next };
      })
    );
  }

  function showAnswerNow(msgId: string) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.role !== "assistant") return m;
        if (m.id !== msgId) return m;
        const total = m.steps?.length || 0;
        return { ...m, stepRevealCount: total };
      })
    );
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm h-[calc(100vh-260px)] flex flex-col overflow-hidden">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">AI Tutor</h1>
          <p className="mt-1 text-sm text-slate-600">
            Math-only homework help (type a question or upload a photo). If you ask a non-math question, it will be rejected.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-full border border-slate-200 bg-white p-1 text-sm">
            {(["answer_only", "full_solution", "stepwise"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-full px-3 py-1.5 font-semibold ${
                  mode === m ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {modeLabel(m)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex-1 min-h-0 flex flex-col gap-3">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="grid gap-3">
            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[min(700px,92%)] rounded-2xl border px-4 py-3 text-sm shadow-sm ${
                      isUser ? "border-slate-200 bg-white" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="whitespace-pre-wrap text-slate-900">{isUser ? (m.text || "") : m.text}</div>

                    {isUser && m.imageDataUrl && (
                      <div className="mt-2">
                        <img
                          src={m.imageDataUrl}
                          alt="Uploaded question"
                          className="max-h-56 rounded-xl border border-slate-200 bg-white"
                        />
                      </div>
                    )}

                    {!isUser && m.steps && m.steps.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-semibold text-slate-600">Steps</div>
                        <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-900">
                          {(m.stepRevealCount ? m.steps.slice(0, m.stepRevealCount) : m.steps).map((s, idx) => (
                            <li key={idx} className="whitespace-pre-wrap">
                              {s}
                            </li>
                          ))}
                        </ol>

                        {mode === "stepwise" && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {(m.stepRevealCount || 0) < m.steps.length ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => revealNext(m.id)}
                                  className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                                >
                                  Next step
                                </button>
                                <button
                                  type="button"
                                  onClick={() => showAnswerNow(m.id)}
                                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                                >
                                  Show all
                                </button>
                              </>
                            ) : null}
                          </div>
                        )}

                        {mode === "stepwise" && (m.stepRevealCount || 0) >= m.steps.length && m.finalAnswer && (
                          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                            <span className="font-semibold">Final answer:</span> {m.finalAnswer}
                          </div>
                        )}
                      </div>
                    )}

                    {!isUser && m.lessons && m.lessons.length > 0 && (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-700">Relevant lessons</div>
                        <div className="mt-2 grid gap-2">
                          {m.lessons.map((l, idx) => (
                            <a
                              key={idx}
                              href={l.url}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                            >
                              <div className="font-semibold text-slate-900">{l.title}</div>
                              {l.why ? <div className="mt-0.5 text-xs text-slate-600">{l.why}</div> : null}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 grid gap-2">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
          )}

          {imageDataUrl && (
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3">
              <img src={imageDataUrl} alt="Preview ‘question photo’" className="h-24 w-24 rounded-xl border border-slate-200 object-cover" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-900">Photo attached</div>
                <div className="mt-0.5 text-xs text-slate-600">You can still add text too.</div>
                <button
                  type="button"
                  onClick={clearImage}
                  className="mt-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            placeholder="Type your math question here…"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
            disabled={busy}
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onPickImage}
                className="hidden"
                id="ai-tutor-file"
                disabled={busy}
              />
              <label
                htmlFor="ai-tutor-file"
                className={`inline-flex cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 ${
                  busy ? "pointer-events-none opacity-60" : ""
                }`}
              >
                Upload photo
              </label>

              <div className="text-xs text-slate-500">Mode: {modeLabel(mode)}</div>
            </div>

            <button
              type="button"
              onClick={send}
              disabled={busy}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {busy ? "Thinking…" : "Send"}
            </button>
          </div>
        </div>

        <div className="shrink-0 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <span className="font-semibold">Note:</span> For best results, upload a clear photo (good lighting, not rotated). The tutor will refuse non-math questions.
        </div>
      </div>
    </div>
  );
}
