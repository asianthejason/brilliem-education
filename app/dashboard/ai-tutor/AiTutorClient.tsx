"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";

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

declare global {
  interface Window {
    MathJax?: any;
  }
}

function MathText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mj = window.MathJax;
    if (!mj || !mj.typesetPromise) return;

    try {
      mj.typesetClear?.([el]);
    } catch {}
    mj.typesetPromise([el]).catch(() => {});
  }, [text]);

  return (
    <span ref={ref} className={className} style={{ whiteSpace: "pre-wrap" }}>
      {text}
    </span>
  );
}

function looksLikeMathExpr(s: string): boolean {
  const t = (s || "").trim();
  if (!t) return false;
  if (/\\(frac|sqrt|times|cdot|sum|int|pi|theta|mu|Delta|alpha|beta|gamma|sin|cos|tan|log|ln|mathrm|text)\b/.test(t)) return true;
  const hasDigit = /\d/.test(t);
  const hasOp = /[=<>+\-*/^_]/.test(t);
  const hasSlash = /\d\s*\/\s*\d/.test(t);
  return (hasDigit && (hasOp || hasSlash));
}

function isMostlyWords(s: string): boolean {
  const t = (s || "").trim();
  if (!t) return true;
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  const digits = (t.match(/\d/g) || []).length;
  const ops = (t.match(/[=<>+\-*/^_]/g) || []).length;
  const hasLatexOp = /\\(frac|sqrt|times|cdot|sum|int)\b/.test(t);
  // If it's basically words + maybe a stray number (like "since final velocity is 0"), treat as non-math.
  return letters >= 6 && ops === 0 && !hasLatexOp && digits <= 2;
}

function unwrapIfNotMath(text: string): string {
  let out = text;
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (m, inner) => (isMostlyWords(inner) ? inner : m));
  out = out.replace(/\\\[(\s*[\s\S]*?\s*)\\\]/g, (m, inner) => (isMostlyWords(inner) ? inner : m));
  return out;
}

function convertDollarDelims(text: string): string {
  let out = text;
  // $$...$$ -> \[...\] (only if it really looks like math)
  out = out.replace(/\$\$([\s\S]*?)\$\$/g, (m, inner) => (looksLikeMathExpr(inner) ? `\\[${inner}\\]` : inner));
  // $...$ -> \( ... \) (avoid multiline)
  out = out.replace(/\$([^\n$]{1,300}?)\$/g, (m, inner) => (looksLikeMathExpr(inner) ? `\\(${inner}\\)` : inner));
  return out;
}

function wrapBareFracs(text: string): string {
  const src = text;
  const fracRe = /\\frac\{[^}]+\}\{[^}]+\}/g;
  let match: RegExpExecArray | null = null;
  let out = "";
  let last = 0;

  function isInsideMathAt(idx: number): boolean {
    const lastOpenInline = src.lastIndexOf("\\(", idx);
    const lastCloseInline = src.lastIndexOf("\\)", idx);
    const lastOpenDisp = src.lastIndexOf("\\[", idx);
    const lastCloseDisp = src.lastIndexOf("\\]", idx);
    const open = Math.max(lastOpenInline, lastOpenDisp);
    const close = Math.max(lastCloseInline, lastCloseDisp);
    return open > close;
  }

  while ((match = fracRe.exec(src))) {
    const i = match.index;
    const token = match[0];
    out += src.slice(last, i);
    if (isInsideMathAt(i)) out += token;
    else out += `\\(${token}\\)`;
    last = i + token.length;
  }
  out += src.slice(last);
  return out;
}

function normalizeTutorText(text: string): string {
  if (!text) return "";
  let out = String(text);

  // Replace common TeX text macro with plain text; units should be outside math.
  out = out.replace(/\\text\{([^}]*)\}/g, "$1");

  // Convert $ delimiters to \( \) only when it looks like math.
  out = convertDollarDelims(out);

  // Wrap bare \frac{a}{b} so it renders with a fraction bar.
  out = wrapBareFracs(out);

  // If MathJax delimiters are incorrectly wrapping plain English, unwrap them.
  out = unwrapIfNotMath(out);

  // Light cleanup
  out = out.replace(/\s{2,}/g, " ");
  return out;
}


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
    text: "Ask me a math or science question (type it, or upload a photo). I’ll respond step-by-step.",
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

const STORAGE_KEY = "brilliem_ai_tutor_chats_v2";

function normalizeLoadedChats(raw: any): ChatSession[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const out: ChatSession[] = raw
    .map((c: any) => {
      if (!c || typeof c !== "object") return null;
      const messages: ChatMsg[] = Array.isArray(c.messages) ? c.messages : [defaultAssistantGreeting()];
      const normalizedMessages: ChatMsg[] = messages.map((m: any) => {
        if (!m || typeof m !== "object") return m;
        if (m.role === "assistant") {
          const steps = Array.isArray(m.steps) ? m.steps.map((s: any) => normalizeTutorText(String(s || ""))).filter(Boolean) : undefined;
          const finalAnswer = m.finalAnswer ? normalizeTutorText(String(m.finalAnswer)) : undefined;
          const text = m.text ? normalizeTutorText(String(m.text)) : "";
          return { ...m, text, steps, finalAnswer } as ChatMsg;
        }
        return m as ChatMsg;
      });
      return {
        id: typeof c.id === "string" ? c.id : uid(),
        title: typeof c.title === "string" ? c.title : "New chat",
        createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
        messages: normalizedMessages,
      } as ChatSession;
    })
    .filter(Boolean) as ChatSession[];

  return out.length ? out : null;
}

export function AiTutorClient() {
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
      const parsed = normalizeLoadedChats(JSON.parse(raw));
      if (!parsed) {
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

  // Auto-scroll to bottom when messages grow
  useEffect(() => {
    const count = messages.length;
    const prev = prevMsgCountRef.current;
    prevMsgCountRef.current = count;

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
      if (activeChatId === chatId) {
        setActiveChatId(next[0].id);
      }
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
      setError("Type a math/science question or upload a photo.");
      return;
    }

    const userText = input.trim();
    const userMsg: ChatMsg = {
      id: uid(),
      role: "user",
      text: userText || undefined,
      imageDataUrl: imageDataUrl || undefined,
    };

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
          mode: "stepwise", // fixed: step-by-step only
          message: userMsg.text || "",
          text: userMsg.text || "", // backwards-compat if you ever change server keys
          imageDataUrl: userMsg.imageDataUrl || null,
          history: history.map((h) => ({ role: h.role, content: h.text })),
        }),
      });

      const data = (await res.json().catch(() => null)) as ApiResponse | null;
      if (!data || !data.ok) {
        const msg = data?.message || `Request failed (${res.status}).`;
        updateActiveChatMessages((prev) => [...prev, { id: uid(), role: "assistant", text: msg }]);
        return;
      }

      const r = data.result;

      if (r.steps && r.steps.length > 0) {
        updateActiveChatMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            text: "Step-by-step solution:",
            steps: (r.steps || []).map((s) => normalizeTutorText(s)),
            finalAnswer: normalizeTutorText(r.finalAnswer),
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
            text: normalizeTutorText(r.displayText || r.finalAnswer),
            finalAnswer: normalizeTutorText(r.finalAnswer),
            lessons: r.lessons,
          },
        ]);
      }
    } catch (e: any) {
      updateActiveChatMessages((prev) => [...prev, { id: uid(), role: "assistant", text: e?.message || "Something went wrong." }]);
    } finally {
      setBusy(false);
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
    <>
      <Script id="mathjax-config" strategy="beforeInteractive">
        {`
          window.MathJax = {
  tex: {
    // Use ONLY \( ... \) and \[ ... \] so normal text never gets accidentally parsed as math.
    // (We intentionally do NOT enable $...$ or $$...$$.)
    inlineMath: [['\\(','\\)']],
    displayMath: [['\\[','\\]']],
    processEscapes: true
  },
  options: { skipHtmlTags: ['script','noscript','style','textarea','pre','code'] }
};
        `}
      </Script>
      <Script id="mathjax-script" strategy="afterInteractive" src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js" />

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col h-[calc(100vh-220px)] overflow-hidden">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">AI Tutor</h1>
            <p className="mt-1 text-sm text-slate-600">
              Math &amp; science homework help{" "}
              <span className="italic">type a question or upload a photo</span>. If you ask something outside math/science, it will be rejected.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="mt-5 flex flex-1 overflow-hidden gap-4">
          {/* Left sidebar: chat list */}
          <aside className="hidden md:flex w-64 shrink-0 flex-col rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden overflow-x-hidden">
            <div className="flex items-center justify-between px-3 py-3 border-b border-slate-200 bg-white">
              <div className="text-sm font-semibold text-slate-900">Chats</div>
              <button
                type="button"
                onClick={newChat}
                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                title="New chat"
              >
                New
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
              <div className="grid gap-2">
                {chats.map((c) => {
                  const active = c.id === activeChat.id;
                  const subtitle = new Date(c.createdAt).toLocaleString();
                  return (
                    <div
                      key={c.id}
                      className={`group w-full overflow-hidden rounded-xl border px-3 py-2 cursor-pointer ${
                        active ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-50 hover:bg-white"
                      }`}
                      onClick={() => setActiveChatId(c.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">{c.title || "New chat"}</div>
                          <div className="mt-0.5 flex items-center gap-2 min-w-0">
                            <span className="truncate text-[11px] text-slate-500">{subtitle}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteChat(c.id);
                          }}
                          className="shrink-0 opacity-0 group-hover:opacity-100 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
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

            <div className="border-t border-slate-200 bg-amber-50 px-3 py-3 text-[11px] text-amber-900 overflow-x-hidden">
              <span className="font-semibold">Tip:</span> Press <span className="font-semibold">Enter</span> to send,{" "}
              <span className="font-semibold">Shift+Enter</span> for a new line.
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
                        <div className="whitespace-pre-wrap text-slate-900">{isUser ? m.text || "" : m.text}</div>

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
                                  <MathText text={normalizeTutorText(s)} />
                                </li>
                              ))}
                            </ol>

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

                            {(m.stepRevealCount || 0) >= m.steps.length && m.finalAnswer && (
                              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                                <span className="font-semibold">Final answer:</span> <MathText text={normalizeTutorText(m.finalAnswer)} />
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
                    <img
                      src={imageDataUrl}
                      alt="Preview question photo"
                      className="h-20 w-20 rounded-xl border border-slate-200 object-cover"
                    />
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
                  placeholder="Type your math/science question here…"
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                  disabled={busy}
                />

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickImage} className="hidden" id="ai-tutor-file" disabled={busy} />
                    <label
                      htmlFor="ai-tutor-file"
                      className={`inline-flex cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 ${
                        busy ? "pointer-events-none opacity-60" : ""
                      }`}
                    >
                      Upload photo
                    </label>
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
                  <span className="font-semibold">Note:</span> For best results, upload a clear photo (good lighting, not rotated). The tutor will refuse non-math/non-science questions.
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
