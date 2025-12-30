"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMsg[];
};

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

function defaultAssistantGreeting(): ChatMsg {
  return {
    id: uid(),
    role: "assistant",
    text: "Ask me a math question (type it, or upload a photo). I can do answer-only, full solutions, or step-by-step.",
  };
}

function makeNewChat(): ChatSession {
  return {
    id: uid(),
    title: "New chat",
    createdAt: Date.now(),
    messages: [defaultAssistantGreeting()],
  };
}

function titleFromUserText(text: string) {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "New chat";
  return t.length > 36 ? t.slice(0, 36) + "…" : t;
}

const STORAGE_KEY = "brilliem_ai_tutor_chats_v1";

export function AiTutorClient() {
  const [mode, setMode] = useState<Mode>("stepwise");
  const [input, setInput] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chats, setChats] = useState<ChatSession[]>(() => [makeNewChat()]);
  const [activeChatId, setActiveChatId] = useState<string>(() => "");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const prevMsgCountRef = useRef<number>(0);

  // Load chats from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const first = makeNewChat();
        setChats([first]);
        setActiveChatId(first.id);
        return;
      }
      const parsed = JSON.parse(raw) as ChatSession[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        const first = makeNewChat();
        setChats([first]);
        setActiveChatId(first.id);
        return;
      }
      setChats(parsed);
      setActiveChatId(parsed[0].id);
    } catch {
      const first = makeNewChat();
      setChats([first]);
      setActiveChatId(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist chats to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    } catch {
      // ignore
    }
  }, [chats]);

  const activeChat = useMemo(() => chats.find((c) => c.id === activeChatId) || chats[0], [chats, activeChatId]);
  const messages = activeChat?.messages || [];

  // Auto-scroll to bottom when messages grow (keeps the composer visible & chat usable)
  useEffect(() => {
    const count = messages.length;
    const prev = prevMsgCountRef.current;
    prevMsgCountRef.current = count;

    // Only jump if new messages appended
    if (count > prev) {
      const el = scrollerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, messages]);

  const history: HistoryItem[] = useMemo(() => {
    const trimmed = messages
      .map((m) => ({
        role: m.role,
        text: m.role === "user" ? (m.text || "") : (m as any).text,
      }))
      .filter((m) => !isProbablyEmpty(m.text));
    return trimmed.slice(-8);
  }, [messages]);

  function updateActiveChatMessages(updater: (prev: ChatMsg[]) => ChatMsg[]) {
    setChats((prevChats) =>
      prevChats.map((c) => {
        if (c.id !== activeChat.id) return c;
        return { ...c, messages: updater(c.messages) };
      })
    );
  }

  function maybeSetChatTitleFromFirstUserMessage(userText: string) {
    setChats((prevChats) =>
      prevChats.map((c) => {
        if (c.id !== activeChat.id) return c;
        if (c.title !== "New chat") return c;
        return { ...c, title: titleFromUserText(userText) };
      })
    );
  }

  function newChat() {
    const c = makeNewChat();
    setChats((prev) => [c, ...prev]);
    setActiveChatId(c.id);
    setInput("");
    setError(null);
    setImageDataUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // allow next render to apply, then scroll
    setTimeout(() => {
      const el = scrollerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  }

  function deleteChat(chatId: string) {
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== chatId);
      if (next.length === 0) {
        const c = makeNewChat();
        setActiveChatId(c.id);
        return [c];
      }
      if (activeChatId === chatId) setActiveChatId(next[0].id);
      return next;
    });
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!/^image\//.test(f.type)) {
      setError("Please upload an image file.");
      e.target.value = "";
      return;
    }

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

    const userText = input.trim();
    const userMsg: ChatMsg = { id: uid(), role: "user", text: userText || undefined, imageDataUrl: imageDataUrl || undefined };

    // add message + set chat title if this is the first prompt
    updateActiveChatMessages((prev) => [...prev, userMsg]);
    if (userText) maybeSetChatTitleFromFirstUserMessage(userText);

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
        updateActiveChatMessages((prev) => [...prev, { id: uid(), role: "assistant", text: msg }]);
        return;
      }

      const r = data.result;

      if (mode === "stepwise" && r.steps && r.steps.length > 0) {
        updateActiveChatMessages((prev) => [
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
        updateActiveChatMessages((prev) => [
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
      updateActiveChatMessages((prev) => [...prev, { id: uid(), role: "assistant", text: e?.message || "Something went wrong." }]);
    } finally {
      setBusy(false);
      // ensure scroller snaps to bottom after response
      requestAnimationFrame(() => {
        const el = scrollerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
  }

  function revealNext(msgId: string) {
    updateActiveChatMessages((prev) =>
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
    updateActiveChatMessages((prev) =>
      prev.map((m) => {
        if (m.role !== "assistant") return m;
        if (m.id !== msgId) return m;
        const total = m.steps?.length || 0;
        return { ...m, stepRevealCount: total };
      })
    );
  }

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!busy) send();
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col h-[calc(100vh-220px)] overflow-hidden">
      {/* Header */}
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
                className={`rounded-full px-3 py-1.5 font-semibold ${mode === m ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}
              >
                {modeLabel(m)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mt-5 flex flex-1 overflow-hidden gap-4">
        {/* Left sidebar: chat list */}
        <aside className="hidden md:flex w-64 shrink-0 flex-col rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-3 border-b border-slate-200 bg-white">
            <div className="text-sm font-semibold text-slate-900">Chats</div>
            <button
              type="button"
              onClick={newChat}
              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              New
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            <div className="grid gap-2">
              {chats.map((c) => {
                const active = c.id === activeChat.id;
                const subtitle = new Date(c.createdAt).toLocaleString();
                return (
                  <div
                    key={c.id}
                    className={`group rounded-xl border px-3 py-2 cursor-pointer ${active ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-50 hover:bg-white"}`}
                    onClick={() => setActiveChatId(c.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{c.title || "New chat"}</div>
                        <div className="truncate text-[11px] text-slate-500">{subtitle}</div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteChat(c.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        title="Delete chat"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-200 bg-amber-50 px-3 py-3 text-[11px] text-amber-900">
            <span className="font-semibold">Tip:</span> Press <span className="font-semibold">Enter</span> to send, <span className="font-semibold">Shift+Enter</span> for a new line.
          </div>
        </aside>

        {/* Main chat */}
        <main className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
          {/* Messages scroller */}
          <div ref={scrollerRef} className="flex-1 overflow-y-auto p-3">
            <div className="grid gap-3">
              {messages.map((m) => {
                const isUser = m.role === "user";
                return (
                  <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[min(720px,92%)] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                      <div className="whitespace-pre-wrap text-slate-900">{isUser ? (m.text || "") : m.text}</div>

                      {isUser && m.imageDataUrl && (
                        <div className="mt-2">
                          <img src={m.imageDataUrl} alt="Uploaded question" className="max-h-56 rounded-xl border border-slate-200 bg-white" />
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

          {/* Composer: always on-screen */}
          <div className="shrink-0 border-t border-slate-200 bg-white p-3">
            <div className="grid gap-2">
              {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}

              {imageDataUrl && (
                <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                  <img src={imageDataUrl} alt="Preview ‘question photo’" className="h-20 w-20 rounded-xl border border-slate-200 object-cover" />
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
                onKeyDown={onComposerKeyDown}
                rows={2}
                placeholder="Type your math question here…"
                className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                disabled={busy}
              />

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickImage} className="hidden" id="ai-tutor-file" disabled={busy} />
                  <label
                    htmlFor="ai-tutor-file"
                    className={`inline-flex cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 ${busy ? "pointer-events-none opacity-60" : ""}`}
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

              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                <span className="font-semibold">Note:</span> For best results, upload a clear photo (good lighting, not rotated). The tutor will refuse non-math questions.
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
