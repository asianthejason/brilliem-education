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

declare global {
  interface Window {
    MathJax?: any;
  }
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function titleFromUserText(text: string) {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "New chat";
  return t.length > 36 ? t.slice(0, 36) + "…" : t;
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

/**
 * Keep only math expressions in MathJax delimiters.
 * Also convert "$...$"/"$$...$$" into "\(...\)"/"\[...\]" (best-effort) in case the model outputs them.
 */
function looksLikeMathExpr(s: string): boolean {
  const t = (s || "").trim();
  if (!t) return false;
  if (/\\(frac|sqrt|times|cdot|sum|int|pi|theta|mu|Delta|alpha|beta|gamma|sin|cos|tan|log|ln|mathrm|text)\b/.test(t)) return true;
  const hasDigit = /\d/.test(t);
  const hasOp = /[=<>+\-*/^_]/.test(t);
  const hasSlash = /\d\s*\/\s*\d/.test(t);
  return hasDigit && (hasOp || hasSlash);
}

function isMostlyWords(s: string): boolean {
  const t = (s || "").trim();
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  const digits = (t.match(/\d/g) || []).length;
  const ops = (t.match(/[=<>+\-*/^_]/g) || []).length;
  const hasLatexOp = /\\(frac|sqrt|times|cdot|sum|int)\b/.test(t);
  return letters >= 6 && ops === 0 && !hasLatexOp && digits <= 2;
}

function unwrapIfNotMath(text: string): string {
  let out = text;
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (m, inner) => (isMostlyWords(inner) ? inner : m));
  out = out.replace(/\\\[(\s*[\s\S]*?\s*)\\\]/g, (m, inner) => (isMostlyWords(inner) ? inner : m));
  return out;
}

function restoreJsonEscapedLatex(text: string): string {
  // If the model outputs LaTeX backslashes unescaped inside JSON, sequences like "\frac" are interpreted as "\f" (form-feed) + "rac"
  // and "\theta" becomes "\t" (tab) + "heta". Restore those control characters back into a visible backslash + letter.
  return (text || "")
    .replace(/\u000c(?=[A-Za-z])/g, "\\f")
    .replace(/\u0009(?=[A-Za-z])/g, "\\t")
    .replace(/\u0008(?=[A-Za-z])/g, "\\b")
    .replace(/\u000d(?=[A-Za-z])/g, "\\r");
}

function wrapBareTeXInPlainSegments(text: string): string {
  const mathRe = /\\\((?:[\s\S]*?)\\\)|\\\[(?:\s*[\s\S]*?\s*)\\\]/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;

  const processPlain = (seg: string) => {
    let s = seg;

    // Fix common lost-backslash TeX commands like "frac{...}{...}" or "sqrt{...}"
    s = s.replace(/(^|[^\\])frac\{/g, "$1\\frac{");
    s = s.replace(/(^|[^\\])sqrt\{/g, "$1\\sqrt{");

    // Wrap bare \frac{a}{b} so it renders with a horizontal bar.
    s = s.replace(/\\frac\{[^{}]+\}\{[^{}]+\}/g, (f) => `\\(${f}\\)`);

    // Wrap simple numeric fractions like 3/4 -> \(\frac{3}{4}\)
    s = s.replace(/\b(\d{1,4})\s*\/\s*(\d{1,4})\b/g, (_m, a, b) => `\\(\\frac{${a}}{${b}}\\)`);

    return s;
  };

  while ((m = mathRe.exec(text))) {
    const start = m.index ?? 0;
    out += processPlain(text.slice(last, start));
    out += m[0]; // keep existing math blocks untouched
    last = start + m[0].length;
  }
  out += processPlain(text.slice(last));
  return out;
}

function normalizeTutorText(text: string): string {
  if (!text) return "";
  let out = restoreJsonEscapedLatex(String(text));

  // Convert $/$$ delimiters into MathJax-safe delimiters (only if it looks like math).
  out = out.replace(/\$\$([\s\S]*?)\$\$/g, (m, inner) => (looksLikeMathExpr(inner) ? `\\[${inner}\\]` : inner));
  out = out.replace(/\$([^\n$]{1,300}?)\$/g, (m, inner) => (looksLikeMathExpr(inner) ? `\\(${inner}\\)` : inner));

  // Avoid \text{...} in outputs; units should be outside math.
  out = out.replace(/\\text\{([^}]*)\}/g, "$1");

  // If delimiters are incorrectly wrapping mostly-english, unwrap.
  out = unwrapIfNotMath(out);

  // Ensure bare fractions render nicely (and keep non-math words as plain text).
  out = wrapBareTeXInPlainSegments(out);

  return out.trim();
}

function MathText({
  text,
  className,
  mjReady,
}: {
  text: string;
  className?: string;
  mjReady: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!mjReady) return;
    const mj = window.MathJax;
    if (!mj || !mj.typesetPromise) return;

    try {
      mj.typesetClear?.([el]);
    } catch {}
    mj.typesetPromise([el]).catch(() => {});
  }, [text, mjReady]);

  return (
    <div ref={ref} className={className} style={{ whiteSpace: "pre-wrap" }}>
      {text}
    </div>
  );
}

function defaultAssistantGreeting(): ChatMsg {
  return {
    id: uid(),
    role: "assistant",
    text: "Ask me a math or science question (type it, or upload a photo).",
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

// Reuse the same storage key, but be backward compatible with older shapes.
const STORAGE_KEY = "brilliem_ai_tutor_chats_v2";

function normalizeLoadedChats(raw: any): ChatSession[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const out: ChatSession[] = raw
    .map((c: any) => {
      if (!c || typeof c !== "object") return null;

      const messages: ChatMsg[] = Array.isArray(c.messages) ? c.messages : [defaultAssistantGreeting()];
      const normalizedMessages: ChatMsg[] = messages.map((m: any) => {
        if (!m || typeof m !== "object") return null;
        if (m.role === "assistant") {
          return {
            ...m,
            text: normalizeTutorText(String(m.text || "")),
            steps: Array.isArray(m.steps) ? m.steps.map((s: any) => normalizeTutorText(String(s || ""))).filter(Boolean) : undefined,
            finalAnswer: m.finalAnswer ? normalizeTutorText(String(m.finalAnswer)) : undefined,
          };
        }
        if (m.role === "user") {
          return {
            ...m,
            text: typeof m.text === "string" ? m.text : undefined,
            imageDataUrl: typeof m.imageDataUrl === "string" ? m.imageDataUrl : undefined,
          };
        }
        return null;
      }).filter(Boolean) as ChatMsg[];

      return {
        id: typeof c.id === "string" ? c.id : uid(),
        title: typeof c.title === "string" ? c.title : "New chat",
        createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
        messages: normalizedMessages.length ? normalizedMessages : [defaultAssistantGreeting()],
      } satisfies ChatSession;
    })
    .filter(Boolean) as ChatSession[];

  return out.length ? out : null;
}

export function AiTutorClient() {
  const [input, setInput] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mathJaxReady, setMathJaxReady] = useState(false);

  const [chats, setChats] = useState<ChatSession[]>(() => [makeNewChat()]);
  const [activeChatId, setActiveChatId] = useState<string>("");

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

  useEffect(() => {
    if (!activeChatId && chats[0]) setActiveChatId(chats[0].id);
  }, [activeChatId, chats]);

  const messages = activeChat?.messages || [];

  // Auto-scroll when message count changes
  useEffect(() => {
    const count = messages.length;
    const prev = prevMsgCountRef.current;
    if (count !== prev) {
      prevMsgCountRef.current = count;
      requestAnimationFrame(() => {
        const el = scrollerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages.length]);

  function updateActiveChatMessages(updater: (prev: ChatMsg[]) => ChatMsg[]) {
    setChats((prevChats) =>
      prevChats.map((c) => (c.id === activeChat.id ? { ...c, messages: updater(c.messages) } : c))
    );
  }

  
  function revealNextStep(msgId: string) {
    updateActiveChatMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || m.role !== "assistant" || !m.steps || m.steps.length === 0) return m;
        const cur = typeof m.stepRevealCount === "number" ? m.stepRevealCount : 1;
        return { ...m, stepRevealCount: Math.min(cur + 1, m.steps.length) };
      })
    );
  }

  function revealAllSteps(msgId: string) {
    updateActiveChatMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || m.role !== "assistant" || !m.steps || m.steps.length === 0) return m;
        return { ...m, stepRevealCount: m.steps.length };
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

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!busy) send();
    }
  }

  function buildHistoryForApi(msgs: ChatMsg[]) {
    // keep last ~10 items, convert assistant into a compact summary
    const trimmed = msgs.slice(-10);
    return trimmed
      .map((m) => {
        if (m.role === "user") {
          const c = (m.text || "").trim();
          if (!c) return null;
          return { role: "user" as const, content: c };
        }
        const parts: string[] = [];
        if (m.steps?.length) parts.push(m.steps.map((s, i) => `${i + 1}. ${stripDelimsForHistory(s)}`).join("\n"));
        if (m.finalAnswer) parts.push(`Final answer: ${stripDelimsForHistory(m.finalAnswer)}`);
        const c = parts.join("\n").trim();
        return c ? { role: "assistant" as const, content: c } : null;
      })
      .filter(Boolean);
  }

  function stripDelimsForHistory(s: string) {
    return String(s || "")
      .replace(/\\\(|\\\)|\\\[|\\\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function send() {
    setError(null);

    if (!imageDataUrl && input.trim().length === 0) {
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
    const img = imageDataUrl;
    clearImage();

    setBusy(true);
    try {
      const res = await fetch("/api/ai-tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "stepwise",
          message: userText || "",
          text: userText || "",
          imageDataUrl: img || null,
          history: buildHistoryForApi(activeChat.messages),
        }),
      });

      const data = (await res.json().catch(() => null)) as ApiResponse | null;
      if (!data) {
        updateActiveChatMessages((prev) => [...prev, { id: uid(), role: "assistant", text: `Request failed (${res.status}).` }]);
        return;
      }

      if (!data.ok) {
        updateActiveChatMessages((prev) => [
          ...prev,
          { id: uid(), role: "assistant", text: data.message || `Request failed (${res.status}).` },
        ]);
        return;
      }

      const r = data.result;
      const steps = (r.steps && r.steps.length ? r.steps : r.finalAnswer ? [r.finalAnswer] : []).map((s) => normalizeTutorText(String(s)));

      updateActiveChatMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          text: normalizeTutorText(r.displayText || "Step-by-step solution:"),
          steps,
          finalAnswer: normalizeTutorText(r.finalAnswer || ""),
          lessons: r.lessons,
          stepRevealCount: steps.length ? 1 : undefined, // reveal 1 step at a time
        },
      ]);
    } catch (e: any) {
      updateActiveChatMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", text: e?.message || "Something went wrong." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Script id="mathjax-config" strategy="beforeInteractive">{`
        window.MathJax = {
          tex: {
            inlineMath: [['\\\\(','\\\\)']],
            displayMath: [['\\\\[','\\\\]']],
            processEscapes: true
          },
          options: { skipHtmlTags: ['script','noscript','style','textarea','pre','code'] }
        };
      `}</Script>

      <Script
        id="mathjax-script"
        strategy="afterInteractive"
        src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"
        onLoad={() => setMathJaxReady(true)}
      />

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col h-[calc(100vh-220px)] overflow-hidden">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-slate-900">AI Tutor</h1>
          <p className="mt-1 text-sm text-slate-600">
            Math &amp; science homework help (<span className="italic">type a question or upload a photo</span>). If you ask something outside math/science, it will be rejected.
          </p>
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
                        {isUser ? (
                          <div className="whitespace-pre-wrap text-slate-900">{m.text || ""}</div>
                        ) : (
                          <MathText text={normalizeTutorText(m.text)} mjReady={mathJaxReady} className="text-slate-900" />
                        )}

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
                              {m.steps.slice(0, typeof m.stepRevealCount === "number" ? m.stepRevealCount : 1).map((s, idx) => (
                                <li key={idx} className="whitespace-pre-wrap">
                                  <MathText text={normalizeTutorText(s)} mjReady={mathJaxReady} />
                                </li>
                              ))}
                            </ol>
                            {m.steps && m.steps.length > 0 && (m.stepRevealCount ?? 1) < m.steps.length && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => revealNextStep(m.id)}
                                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
                                >
                                  Next step
                                </button>
                                <button
                                  type="button"
                                  onClick={() => revealAllSteps(m.id)}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                                >
                                  Show all
                                </button>
                              </div>
                            )}


                            {m.finalAnswer && (!m.steps || m.steps.length === 0 || (m.stepRevealCount ?? 1) >= m.steps.length) ? (
                              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                                <span className="font-semibold">Final answer:</span>{" "}
                                <MathText text={normalizeTutorText(m.finalAnswer)} mjReady={mathJaxReady} className="inline" />
                              </div>
                            ) : null}
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

            {/* Composer */}
            <div className="shrink-0 border-t border-slate-200 bg-white p-3">
              <div className="grid gap-2">
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {error}
                  </div>
                )}

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

                <div className="flex items-end gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={onPickImage}
                    className="hidden"
                    disabled={busy}
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    aria-label="Upload photo"
                    title="Upload photo"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </button>

                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onComposerKeyDown}
                    rows={2}
                    placeholder="Type your math/science question here…"
                    className="flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400 disabled:opacity-60"
                    disabled={busy}
                  />

                  <button
                    type="button"
                    onClick={send}
                    disabled={busy}
                    className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-900 px-6 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {busy ? "Thinking…" : "Send"}
                  </button>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
