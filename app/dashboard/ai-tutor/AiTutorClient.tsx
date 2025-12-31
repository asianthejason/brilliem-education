"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Mode = "answer_only" | "full_solution" | "step_by_step";

type LessonCard = {
  title: string;
  url: string;
  why?: string;
};

type ApiResponse = {
  rejected?: boolean;
  rejectionMessage?: string;
  finalAnswer?: string;
  steps?: string[];
  fullSolution?: string;
  displayText?: string; // backwards-compat for older responses
  lessons?: LessonCard[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  // assistant extras
  modeUsed?: Mode;
  finalAnswer?: string;
  steps?: string[];
  fullSolution?: string;
  lessons?: LessonCard[];
};

type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  mode: Mode | null; // locks after first user message
  messages: ChatMessage[];
};

const STORAGE_KEY = "brilliem_ai_tutor_chats_v2";

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function modeLabelShort(m: Mode) {
  if (m === "answer_only") return "Answer only";
  if (m === "full_solution") return "Full solution";
  return "Step-by-step";
}

function modeBadge(m: Mode | null) {
  if (!m) return "—";
  if (m === "answer_only") return "A";
  if (m === "full_solution") return "F";
  return "S";
}

/**
 * Fixes common JSON-escape issues that can eat LaTeX backslashes:
 * - "\frac" in JSON can become "\f" (formfeed) + "rac" after JSON.parse.
 * We convert those control chars back into a TeX backslash command prefix.
 */
function repairLatexControlChars(s: string) {
  return s
    .replace(/\u000c/g, "\\\\f") // \f
    .replace(/\u0008/g, "\\\\b") // \b
    .replace(/\u0009/g, "\\\\t") // \t
    .replace(/\u000b/g, "\\\\v") // \v
    .replace(/\u000d/g, "\\\\r"); // \r
}

/**
 * Prefer \( \) and \[ \] delimiters so MathJax doesn't accidentally
 * interpret $ used for currency or random UI strings.
 * We also convert common $...$ / $$...$$ into \( \) / \[ \] when it looks like math.
 */
function normalizeMathDelimiters(raw: string) {
  let s = repairLatexControlChars(raw);

  // Convert display math $$...$$ -> \[...\]
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_m, inner) => `\\[${inner}\\]`);

  // Convert inline $...$ -> \( ... \) when it looks like math (avoid currency).
  // Note: this is a heuristic. We only convert if the content has typical math markers.
  s = s.replace(/(^|[^\\])\$([^$]+?)\$/g, (match, prefix, inner) => {
    const trimmed = String(inner).trim();
    const looksCurrency = /^\d/.test(trimmed) && !/[=\\^_+\-*/()]/.test(trimmed);
    const looksMath = /[=\\^_+\-*/()]/.test(trimmed) || /\\(frac|sqrt|cdot|times|pi|theta|alpha|beta|gamma)/.test(trimmed);
    if (looksCurrency || !looksMath) return match;
    return `${prefix}\\(${inner}\\)`;
  });

  return s;
}

function useMathJax() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const w = window as any;
    if (w.MathJax && w.MathJax.typesetPromise) {
      setReady(true);
      return;
    }

    // Configure BEFORE loading script.
    w.MathJax = {
      tex: {
        inlineMath: [["\\(", "\\)"]],
        displayMath: [["\\[", "\\]"]],
        processEscapes: true,
      },
      options: {
        // Avoid touching code blocks or style tags.
        skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"],
      },
    };

    const existing = document.querySelector<HTMLScriptElement>("script[data-brilliem-mathjax='1']");
    if (existing) {
      existing.addEventListener("load", () => setReady(true));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
    script.async = true;
    script.defer = true;
    script.dataset.brilliemMathjax = "1";
    script.onload = () => setReady(true);
    script.onerror = () => {
      // If MathJax fails to load, we still render plain text.
      setReady(false);
    };
    document.head.appendChild(script);
  }, []);

  return ready;
}

function MathText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const ready = useMathJax();
  const ref = useRef<HTMLDivElement | null>(null);

  const normalized = useMemo(() => normalizeMathDelimiters(text), [text]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Reset to raw text (prevents MathJax markup from accumulating across renders)
    el.innerHTML = "";
    el.appendChild(document.createTextNode(normalized));

    if (!ready) return;
    const w = window as any;
    if (w.MathJax?.typesetPromise) {
      w.MathJax.typesetPromise([el]).catch(() => {
        // No-op: fall back to plain text
      });
    }
  }, [normalized, ready]);

  return <div ref={ref} className={className} />;
}

function defaultChat(): ChatSession {
  return {
    id: uid(),
    title: "New chat",
    createdAt: Date.now(),
    mode: null,
    messages: [
      {
        id: uid(),
        role: "assistant",
        text: "Ask me a math or science question (type it, or upload a photo). I can do answer-only, full solutions, or step-by-step.",
        createdAt: Date.now(),
      },
    ],
  };
}

function safeLoadChats(): ChatSession[] {
  if (typeof window === "undefined") return [defaultChat()];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [defaultChat()];
    const parsed = JSON.parse(raw) as ChatSession[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [defaultChat()];
    return parsed;
  } catch {
    return [defaultChat()];
  }
}

function saveChats(chats: ChatSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    // ignore
  }
}

export default function AiTutorClient() {
  const [chats, setChats] = useState<ChatSession[]>(() => safeLoadChats());
  const [activeChatId, setActiveChatId] = useState<string>(() => chats[0]?.id ?? "");
  const [draft, setDraft] = useState("");
  const [modeSelection, setModeSelection] = useState<Mode>("step_by_step");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeChat = useMemo(() => chats.find((c) => c.id === activeChatId) ?? chats[0], [chats, activeChatId]);

  const chatLocked = !!activeChat?.mode;

  useEffect(() => {
    saveChats(chats);
  }, [chats]);

  useEffect(() => {
    // keep selection in sync when switching chats
    if (!activeChat) return;
    if (activeChat.mode) setModeSelection(activeChat.mode);
  }, [activeChat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages?.length]);

  function updateActiveChat(updater: (c: ChatSession) => ChatSession) {
    setChats((prev) => prev.map((c) => (c.id === activeChatId ? updater(c) : c)));
  }

  function createNewChat(withMode: Mode) {
    const c = defaultChat();
    c.mode = null;
    setChats((prev) => [c, ...prev]);
    setActiveChatId(c.id);
    setModeSelection(withMode);
  }

  async function send() {
    const text = draft.trim();
    if (!text || !activeChat || isSending) return;

    setIsSending(true);

    // lock mode on first user message in this chat
    const modeToUse: Mode = activeChat.mode ?? modeSelection;

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      text,
      createdAt: Date.now(),
    };

    const assistantMsg: ChatMessage = {
      id: uid(),
      role: "assistant",
      text: "…",
      createdAt: Date.now(),
      modeUsed: modeToUse,
    };

    updateActiveChat((c) => ({
      ...c,
      title: c.title === "New chat" ? text.slice(0, 40) : c.title,
      mode: c.mode ?? modeToUse,
      messages: [...c.messages, userMsg, assistantMsg],
    }));

    setDraft("");

    try {
      const res = await fetch("/api/ai-tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, mode: modeToUse, chatId: activeChat.id }),
      });

      const json = (await res.json().catch(() => ({}))) as ApiResponse;

      const rejected = !!json.rejected;
      const rejectionMessage = json.rejectionMessage || "I can only help with math or science homework. Please ask a math or science question.";

      const finalAnswer = normalizeMathDelimiters(json.finalAnswer || "");
      const steps = (json.steps || []).map((s) => normalizeMathDelimiters(s));
      const fullSolution = normalizeMathDelimiters(json.fullSolution || json.displayText || "");

      updateActiveChat((c) => ({
        ...c,
        messages: c.messages.map((m) => {
          if (m.id !== assistantMsg.id) return m;
          if (rejected) {
            return {
              ...m,
              text: rejectionMessage,
              modeUsed: modeToUse,
            };
          }
          // For answer_only, keep chat clean: show just the final answer
          const display =
            modeToUse === "answer_only"
              ? finalAnswer || fullSolution || "(no answer)"
              : modeToUse === "full_solution"
                ? fullSolution || finalAnswer || "(no solution)"
                : ""; // step_by_step: the UI renders steps separately
          return {
            ...m,
            text: display,
            modeUsed: modeToUse,
            finalAnswer,
            steps,
            fullSolution,
            lessons: json.lessons || [],
          };
        }),
      }));
    } catch (e) {
      updateActiveChat((c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === assistantMsg.id ? { ...m, text: "Request failed (500)." } : m
        ),
      }));
    } finally {
      setIsSending(false);
    }
  }

  const modes: Mode[] = ["answer_only", "full_solution", "step_by_step"];

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">AI Tutor</h1>
            <p className="mt-1 text-slate-600">
              Math &amp; science homework help (type a question or upload a photo). If you ask something outside math/science, it will be rejected.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {chatLocked
                ? (
                  <>
                    Mode is locked for this chat: <span className="font-semibold text-slate-700">{modeLabelShort(activeChat.mode as Mode)}</span>. Start a new chat to change the mode.
                  </>
                )
                : "Choose a mode for this chat before you send your first message."}
            </p>
          </div>

          {/* Mode selector */}
          <div className="flex-shrink-0">
            <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
              {modes.map((m) => {
                const isActive = modeSelection === m;
                const disabled = chatLocked && activeChat.mode !== m;
                const title = disabled ? "Start a new chat to change the mode." : modeLabelShort(m);
                return (
                  <button
                    key={m}
                    type="button"
                    title={title}
                    onClick={() => {
                      if (disabled) return;
                      setModeSelection(m);
                    }}
                    className={[
                      "whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition",
                      isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50",
                      disabled ? "cursor-not-allowed opacity-50 hover:bg-transparent" : "",
                    ].join(" ")}
                  >
                    {modeLabelShort(m)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[320px_1fr]">
          {/* Sidebar */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <div className="font-semibold text-slate-900">Chats</div>
              <button
                type="button"
                onClick={() => createNewChat(modeSelection)}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                New
              </button>
            </div>

            <div className="max-h-[520px] overflow-y-auto p-3">
              {chats.map((c) => {
                const selected = c.id === activeChatId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveChatId(c.id)}
                    className={[
                      "mb-2 w-full rounded-xl border p-3 text-left transition",
                      selected ? "border-slate-900 bg-white" : "border-slate-200 bg-white hover:border-slate-300",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="line-clamp-2 text-sm font-semibold text-slate-900">{c.title || "New chat"}</div>
                      <div className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                        {modeBadge(c.mode)}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {new Date(c.createdAt).toLocaleString()}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-slate-200 p-3 text-xs text-slate-600">
              Tip: Press <b>Enter</b> to send, <b>Shift+Enter</b> for a new line.
            </div>
          </div>

          {/* Chat panel */}
          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex h-[640px] flex-col">
              {/* messages */}
              <div className="flex-1 overflow-y-auto p-4">
                {activeChat?.messages?.map((m) => {
                  const isUser = m.role === "user";
                  return (
                    <div key={m.id} className={["mb-4 flex", isUser ? "justify-end" : "justify-start"].join(" ")}>
                      <div
                        className={[
                          "max-w-[85%] rounded-2xl border px-4 py-3 text-sm shadow-sm",
                          isUser ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50",
                        ].join(" ")}
                      >
                        {/* User message */}
                        {isUser ? (
                          <div className="whitespace-pre-wrap text-slate-900">{m.text}</div>
                        ) : (
                          <div className="space-y-4">
                            {/* Step-by-step: show steps + final answer */}
                            {m.modeUsed === "step_by_step" && (m.finalAnswer || (m.steps && m.steps.length)) ? (
                              <>
                                {m.finalAnswer ? (
                                  <div className="text-slate-900">
                                    <MathText text={m.finalAnswer} className="whitespace-pre-wrap" />
                                  </div>
                                ) : null}

                                {m.steps && m.steps.length ? (
                                  <div>
                                    <div className="mb-2 font-semibold text-slate-900">Steps</div>
                                    <ol className="list-decimal space-y-1 pl-5 text-slate-900">
                                      {m.steps.map((s, i) => (
                                        <li key={i}>
                                          <MathText text={s} className="whitespace-pre-wrap" />
                                        </li>
                                      ))}
                                    </ol>
                                  </div>
                                ) : null}

                                {m.finalAnswer ? (
                                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-slate-900">
                                    <div className="font-semibold text-emerald-900">Final answer:</div>
                                    <MathText text={m.finalAnswer} className="whitespace-pre-wrap" />
                                  </div>
                                ) : null}
                              </>
                            ) : null}

                            {/* Full solution: show fullSolution + finalAnswer */}
                            {m.modeUsed === "full_solution" && (m.fullSolution || m.text) ? (
                              <>
                                <MathText
                                  text={m.fullSolution || m.text}
                                  className="whitespace-pre-wrap text-slate-900"
                                />
                                {m.finalAnswer ? (
                                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-slate-900">
                                    <div className="font-semibold text-emerald-900">Final answer:</div>
                                    <MathText text={m.finalAnswer} className="whitespace-pre-wrap" />
                                  </div>
                                ) : null}
                              </>
                            ) : null}

                            {/* Answer only: show plain */}
                            {m.modeUsed === "answer_only" ? (
                              <MathText text={m.text} className="whitespace-pre-wrap text-slate-900" />
                            ) : null}

                            {/* fallback (errors / rejections) */}
                            {!m.modeUsed ? (
                              <div className="whitespace-pre-wrap text-slate-900">{m.text}</div>
                            ) : null}

                            {/* Relevant lessons */}
                            {m.lessons && m.lessons.length ? (
                              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Relevant lessons
                                </div>
                                <div className="space-y-2">
                                  {m.lessons.slice(0, 3).map((l, i) => (
                                    <a
                                      key={i}
                                      href={l.url}
                                      className="block rounded-xl border border-slate-200 p-3 hover:border-slate-300"
                                    >
                                      <div className="font-semibold text-slate-900">{l.title}</div>
                                      {l.why ? <div className="mt-1 text-xs text-slate-600">{l.why}</div> : null}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-slate-200 p-4">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type your math or science question here..."
                  className="h-24 w-full resize-none rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-slate-400"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                      onClick={() => {
                        // Placeholder for photo upload hook (kept from your existing UI).
                        alert("Photo upload not wired in this component yet.");
                      }}
                    >
                      Upload photo
                    </button>
                    <div className="text-sm text-slate-600">
                      Mode: <span className="font-semibold">{modeLabelShort(modeSelection)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={isSending || !draft.trim()}
                    className={[
                      "rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white",
                      isSending || !draft.trim() ? "opacity-50" : "hover:bg-slate-800",
                    ].join(" ")}
                  >
                    Send
                  </button>
                </div>

                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-900">
                  <span className="font-semibold">Note:</span> For best results, upload a clear photo (good lighting, not rotated). The tutor will refuse non-math/non-science questions.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
