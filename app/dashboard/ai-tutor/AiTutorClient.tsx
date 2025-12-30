/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Mode = "answer_only" | "full_solution" | "step_by_step";

type Lesson = {
  title: string;
  url: string;
  description?: string;
  tags?: string[];
};

type ApiResponse = {
  ok: boolean;
  allowed?: boolean;
  subject?: string;
  mode?: Mode;
  finalAnswer?: string;
  steps?: string[];
  fullSolution?: string;
  refusal?: string;
  relevantLessons?: Lesson[];
  error?: string;
};

type ChatMessage =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      allowed: boolean;
      subject: string;
      mode: Mode;
      finalAnswer: string;
      steps: string[];
      fullSolution: string;
      refusal: string;
      relevantLessons: Lesson[];
    };

type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  lockedMode: Mode | null; // locks after first send
  messages: ChatMessage[];
};

const LS_KEY = "brilliem_ai_tutor_chats_v1";

function formatTime(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function modeLabel(m: Mode) {
  if (m === "answer_only") return "Answer only";
  if (m === "full_solution") return "Full solution";
  return "Step-by-step";
}

export default function AiTutorClient() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [selectedMode, setSelectedMode] = useState<Mode>("step_by_step");
  const [busy, setBusy] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) || null,
    [sessions, activeId]
  );

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatSession[];
        if (Array.isArray(parsed) && parsed.length) {
          setSessions(parsed);
          setActiveId(parsed[0].id);
          return;
        }
      }
    } catch {
      // ignore
    }

    const first: ChatSession = {
      id: makeId(),
      title: "New chat",
      createdAt: Date.now(),
      lockedMode: null,
      messages: [],
    };
    setSessions([first]);
    setActiveId(first.id);
  }, []);

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(sessions));
    } catch {
      // ignore
    }
  }, [sessions]);

  // Auto-scroll
  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [active?.messages.length]);

  function updateActive(updater: (s: ChatSession) => ChatSession) {
    setSessions((prev) => prev.map((s) => (s.id === activeId ? updater(s) : s)));
  }

  function startNewChat() {
    const session: ChatSession = {
      id: makeId(),
      title: "New chat",
      createdAt: Date.now(),
      lockedMode: null,
      messages: [],
    };
    setSessions((prev) => [session, ...prev]);
    setActiveId(session.id);
    setDraft("");
    setImageDataUrl(null);
  }

  function onPickSession(id: string) {
    setActiveId(id);
    setDraft("");
    setImageDataUrl(null);
  }

  function handleModeClick(mode: Mode) {
    if (!active) return;
    if (active.lockedMode) return;
    setSelectedMode(mode);
  }

  function lockModeIfNeeded(): Mode {
    const modeToUse: Mode = active?.lockedMode || selectedMode;
    if (active && !active.lockedMode) {
      updateActive((s) => ({ ...s, lockedMode: modeToUse }));
    }
    return modeToUse;
  }

  async function send() {
    if (!active || busy) return;
    const text = draft.trim();
    if (!text && !imageDataUrl) return;

    const modeToUse = lockModeIfNeeded();

    const title =
      active.messages.length === 0
        ? (text || "Photo question").slice(0, 40)
        : active.title;

    updateActive((s) => ({
      ...s,
      title,
      messages: [...s.messages, { role: "user", text: text || "📷 Photo question" }],
    }));

    setDraft("");
    setBusy(true);

    try {
      const res = await fetch("/api/ai-tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, mode: modeToUse, imageDataUrl }),
      });

      const data = (await res.json().catch(() => ({}))) as ApiResponse;

      if (!res.ok || !data.ok) {
        updateActive((s) => ({
          ...s,
          messages: [
            ...s.messages,
            {
              role: "assistant",
              allowed: false,
              subject: "other",
              mode: modeToUse,
              finalAnswer: "",
              steps: [],
              fullSolution: "",
              refusal: data.error || `Request failed (${res.status}).`,
              relevantLessons: [],
            },
          ],
        }));
      } else {
        updateActive((s) => ({
          ...s,
          messages: [
            ...s.messages,
            {
              role: "assistant",
              allowed: !!data.allowed,
              subject: data.subject || "other",
              mode: modeToUse,
              finalAnswer: data.finalAnswer || "",
              steps: Array.isArray(data.steps) ? data.steps : [],
              fullSolution: data.fullSolution || "",
              refusal: data.refusal || "",
              relevantLessons: Array.isArray(data.relevantLessons) ? data.relevantLessons : [],
            },
          ],
        }));
      }
    } catch (e: any) {
      updateActive((s) => ({
        ...s,
        messages: [
          ...s.messages,
          {
            role: "assistant",
            allowed: false,
            subject: "other",
            mode: modeToUse,
            finalAnswer: "",
            steps: [],
            fullSolution: "",
            refusal: e?.message || "Request failed.",
            relevantLessons: [],
          },
        ],
      }));
    } finally {
      setBusy(false);
      setImageDataUrl(null);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function onUploadPhoto(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  const modeLocked = !!active?.lockedMode;
  const modeTooltip = modeLocked ? "Start a new chat to change the mode." : "";

  return (
    <div className="w-full">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">AI Tutor</h2>
          <p className="text-sm text-slate-600">
            Math &amp; science homework help (type a question or upload a photo). If you ask
            something outside math/science, it will be rejected.
          </p>

          {active?.lockedMode ? (
            <p className="mt-2 text-xs text-slate-500">
              Mode is locked for this chat:{" "}
              <span className="font-semibold text-slate-700">{modeLabel(active.lockedMode)}</span>.
              {" "}Start a new chat to change the mode.
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              Choose a mode for this chat before you send your first message.
            </p>
          )}
        </div>

        <div className="flex shrink-0 justify-end">
          <div className="inline-flex max-w-[560px] flex-wrap items-center gap-2 rounded-full border bg-white p-2">
            {(["answer_only", "full_solution", "step_by_step"] as Mode[]).map((m) => {
              const current = active?.lockedMode || selectedMode;
              const isActive = current === m;
              const disabled = !!active?.lockedMode && active.lockedMode !== m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleModeClick(m)}
                  disabled={disabled}
                  title={disabled ? modeTooltip : ""}
                  className={[
                    "whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold transition",
                    isActive ? "bg-slate-900 text-white" : "bg-white text-slate-700",
                    disabled ? "cursor-not-allowed opacity-50" : "hover:bg-slate-100",
                  ].join(" ")}
                >
                  {modeLabel(m)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          {/* Chats list */}
          <div className="flex min-h-[520px] flex-col rounded-xl border">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div className="font-semibold">Chats</div>
              <button
                type="button"
                onClick={startNewChat}
                className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white hover:bg-slate-800"
              >
                New
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onPickSession(s.id)}
                  className={[
                    "mb-2 w-full rounded-xl border px-3 py-2 text-left transition",
                    s.id === activeId ? "border-slate-900 bg-slate-50" : "hover:bg-slate-50",
                  ].join(" ")}
                >
                  <div className="line-clamp-1 font-semibold">{s.title || "New chat"}</div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>{formatTime(s.createdAt)}</span>
                    <span className="rounded-full border px-2 py-0.5">
                      {s.lockedMode ? modeLabel(s.lockedMode).slice(0, 1) : "—"}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="border-t bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Tip: Press <b>Enter</b> to send, <b>Shift+Enter</b> for a new line.
            </div>
          </div>

          {/* Chat panel */}
          <div className="flex min-h-[520px] flex-col rounded-xl border">
            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto p-4"
              style={{ maxHeight: "calc(100vh - 420px)" }}
            >
              {active?.messages?.length ? (
                active.messages.map((m, idx) => {
                  if (m.role === "user") {
                    return (
                      <div key={idx} className="mb-3 flex justify-end">
                        <div className="max-w-[80%] rounded-2xl border bg-white px-4 py-2 shadow-sm">
                          {m.text}
                        </div>
                      </div>
                    );
                  }

                  if (!m.allowed) {
                    return (
                      <div key={idx} className="mb-3 flex justify-start">
                        <div className="max-w-[80%] rounded-2xl border bg-white px-4 py-2 shadow-sm">
                          {m.refusal || "I can only help with math & science questions."}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={idx} className="mb-4 flex justify-start">
                      <div className="max-w-[80%] rounded-2xl border bg-white px-4 py-3 shadow-sm">
                        {m.mode === "full_solution" && m.fullSolution ? (
                          <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                            {m.fullSolution}
                          </div>
                        ) : null}

                        {m.mode === "step_by_step" && m.steps?.length ? (
                          <div className="mt-1">
                            <div className="mb-2 text-sm font-semibold">Steps</div>
                            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-800">
                              {m.steps.map((s, i) => (
                                <li key={i} className="whitespace-pre-wrap">
                                  {s}
                                </li>
                              ))}
                            </ol>
                          </div>
                        ) : null}

                        {m.finalAnswer ? (
                          <div className="mt-3 rounded-xl border bg-emerald-50 px-4 py-2 text-sm">
                            <span className="font-semibold">Final answer:</span>{" "}
                            <span className="whitespace-pre-wrap">{m.finalAnswer}</span>
                          </div>
                        ) : null}

                        {m.relevantLessons?.length ? (
                          <div className="mt-3 rounded-xl border bg-slate-50 p-3">
                            <div className="mb-2 text-sm font-semibold">Relevant lessons</div>
                            <div className="space-y-2">
                              {m.relevantLessons.map((l) => (
                                <a
                                  key={l.url}
                                  href={l.url}
                                  className="block rounded-xl border bg-white p-3 hover:bg-slate-50"
                                >
                                  <div className="font-semibold">{l.title}</div>
                                  {l.description ? (
                                    <div className="text-sm text-slate-600">{l.description}</div>
                                  ) : null}
                                </a>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-sm text-slate-500">Ask me a math or science question.</div>
              )}
            </div>

            {/* Composer */}
            <div className="sticky bottom-0 border-t bg-white p-4">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Type your math/science question here..."
                className="h-24 w-full resize-none rounded-2xl border p-4 outline-none focus:ring-2 focus:ring-slate-200"
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold hover:bg-slate-50">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => onUploadPhoto(e.target.files?.[0] || null)}
                    />
                    Upload photo
                  </label>
                  <div className="text-xs text-slate-500">
                    Mode:{" "}
                    <span className="font-semibold">
                      {modeLabel(active?.lockedMode || selectedMode)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={busy || (!draft.trim() && !imageDataUrl)}
                  className="rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Sending..." : "Send"}
                </button>
              </div>

              {imageDataUrl ? (
                <div className="mt-3 text-xs text-slate-500">
                  Photo attached. It will be sent with your next message.
                </div>
              ) : null}

              <div className="mt-3 rounded-xl border bg-amber-50 px-4 py-2 text-xs text-amber-800">
                Note: For best results, upload a clear photo (good lighting, not rotated).
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 text-xs text-slate-500">
        Chats are stored locally in your browser (localStorage). No server storage cost unless you
        later decide to save them in a database.
      </div>
    </div>
  );
}
