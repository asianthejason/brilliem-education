"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  GRADES_7_TO_12,
  isLessonUnlocked,
  type Tier,
  type UnitRef,
  type LessonRef,
} from "@/lib/gradeCatalog";
import { checkAnswer, getBankForLesson, type Question } from "@/lib/questionBank";

type Attempt = { correct: boolean; ts: number };

const STORAGE_ATTEMPTS = "brilliem_lesson_attempts_v1";
const STORAGE_USED_BANK = "brilliem_lesson_used_bank_v1";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

function pctFromAttempts(attempts: Attempt[]): number | null {
  if (!attempts || attempts.length === 0) return null;
  const last = attempts.slice(-20);
  const correct = last.filter((a) => a.correct).length;
  // Score is ALWAYS out of the last 20 questions.
  // If fewer than 20 have been answered, the remaining are treated as incorrect.
  return Math.round((correct / 20) * 100);
}

function bankStatus(lessonId: string) {
  const used = readJson<Record<string, string[]>>(STORAGE_USED_BANK, {});
  const usedIds = new Set(used[lessonId] || []);
  const bank = getBankForLesson(lessonId);
  const remaining = bank.filter((q) => !usedIds.has(q.id)).length;
  return { total: bank.length, remaining };
}

async function fetchAiQuestion(params: { lessonId: string; recentPrompts: string[] }) {
  const res = await fetch("/api/lesson-question", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || "Failed to generate question");
  }
  return json.question as Question;
}

export function LessonsClient({ tier }: { tier: Tier }) {
  const grades = GRADES_7_TO_12;

  const grade7 = grades.find((g) => g.grade === 7) || grades[0]!;
  const initialUnit = grade7.units[0];
  const initialLesson = initialUnit?.lessons[0];

  const [selectedGrade, setSelectedGrade] = useState<number>(grade7.grade);
  const [selectedUnitId, setSelectedUnitId] = useState<string>(initialUnit?.id || "");
  const [selectedLessonId, setSelectedLessonId] = useState<string>(initialLesson?.id || "");

  const [activeTab, setActiveTab] = useState<"practice" | "unit_test">("practice");

  const [question, setQuestion] = useState<Question | null>(null);
  const [userInput, setUserInput] = useState<string>("");
  const [checked, setChecked] = useState<null | { correct: boolean }>(null);
  const [loadingQ, setLoadingQ] = useState(false);
  const [qError, setQError] = useState<string | null>(null);
  const [bankInfo, setBankInfo] = useState<{ total: number; remaining: number }>({ total: 0, remaining: 0 });

  const recentPromptsRef = useRef<string[]>([]);
  const lastAiCallAt = useRef<number>(0);

  const selectedGradeObj = useMemo(() => grades.find((g) => g.grade === selectedGrade) || grade7, [grades, grade7, selectedGrade]);
  const selectedUnit = useMemo<UnitRef | null>(
    () => selectedGradeObj.units.find((u) => u.id === selectedUnitId) || selectedGradeObj.units[0] || null,
    [selectedGradeObj, selectedUnitId]
  );
  const selectedLesson = useMemo<LessonRef | null>(
    () => selectedUnit?.lessons.find((l) => l.id === selectedLessonId) || selectedUnit?.lessons[0] || null,
    [selectedUnit, selectedLessonId]
  );

  // Keep selected IDs valid when grade changes.
  useEffect(() => {
    const g = selectedGradeObj;
    const u = g.units.find((x) => x.id === selectedUnitId) || g.units[0];
    const l = u?.lessons.find((x) => x.id === selectedLessonId) || u?.lessons[0];
    if (u?.id && u.id !== selectedUnitId) setSelectedUnitId(u.id);
    if (l?.id && l.id !== selectedLessonId) setSelectedLessonId(l.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGrade]);

  // Load first question when lesson changes.
  useEffect(() => {
    if (!selectedLessonId) return;
    void loadNextQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLessonId]);

  async function loadNextQuestion() {
    const lessonId = selectedLessonId;
    if (!lessonId) return;

    setLoadingQ(true);
    setQError(null);
    setChecked(null);
    setUserInput("");

    try {
      // Free tier gating (first lesson only per unit)
      const unit = selectedUnit;
      if (unit) {
        const idx = unit.lessons.findIndex((l) => l.id === lessonId);
        const unlocked = isLessonUnlocked({ tier, unit, lessonIndex: Math.max(0, idx) });
        if (!unlocked) {
          setQuestion(null);
          setBankInfo({ total: 0, remaining: 0 });
          setQError("This lesson is locked on your current plan.");
          return;
        }
      }

      // 1) Question bank first
      const bank = getBankForLesson(lessonId);
      const used = readJson<Record<string, string[]>>(STORAGE_USED_BANK, {});
      const usedIds = new Set(used[lessonId] || []);

      const nextBank = bank.find((qq) => !usedIds.has(qq.id)) || null;
      const remaining = bank.filter((qq) => !usedIds.has(qq.id)).length;
      setBankInfo({ total: bank.length, remaining });

      if (nextBank) {
        // mark as used immediately (so refresh doesn't repeat too much)
        const updated = { ...used, [lessonId]: [...(used[lessonId] || []), nextBank.id] };
        writeJson(STORAGE_USED_BANK, updated);
        setQuestion(nextBank);
        return;
      }

      // 2) Bank exhausted -> AI fallback (only for lessons_ai)
      if (tier === "lessons_ai") {
        const now = Date.now();
        if (now - lastAiCallAt.current < 12_000) {
          throw new Error("Please wait a moment before generating another AI question.");
        }
        lastAiCallAt.current = now;

        const recent = recentPromptsRef.current.slice(-8);
        const aiQ = await fetchAiQuestion({ lessonId, recentPrompts: recent });
        recentPromptsRef.current = [...recent, aiQ.prompt].slice(-12);
        setQuestion(aiQ);
        setBankInfo({ total: bank.length, remaining: 0 });
        return;
      }

      // 3) No AI tier -> allow repeats (cycle bank)
      if (bank.length > 0) {
        // reset used list for this lesson
        const updated = { ...used, [lessonId]: [] };
        writeJson(STORAGE_USED_BANK, updated);
        setQuestion(bank[0]!);
        setBankInfo({ total: bank.length, remaining: bank.length - 1 });
        return;
      }

      setQuestion(null);
      setQError("Practice bank for this lesson is coming soon.");
    } catch (e: any) {
      setQuestion(null);
      setQError(e?.message || "Failed to load question");
    } finally {
      setLoadingQ(false);
    }
  }

  function recordAttempt(lessonId: string, correct: boolean) {
    const all = readJson<Record<string, Attempt[]>>(STORAGE_ATTEMPTS, {});
    const prev = all[lessonId] || [];
    const next = [...prev, { correct, ts: Date.now() }].slice(-50);
    const updated = { ...all, [lessonId]: next };
    writeJson(STORAGE_ATTEMPTS, updated);
  }

  const attemptsByLesson = useMemo(() => readJson<Record<string, Attempt[]>>(STORAGE_ATTEMPTS, {}), [selectedLessonId]);

  function scoreLabel(lessonId: string) {
    const pct = pctFromAttempts(attemptsByLesson[lessonId] || []);
    return pct === null ? "N/A" : `${pct}%`;
  }

  const unitDisplay = selectedUnit ? `${selectedUnit.strand} • ${selectedUnit.title}` : "";

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[320px_1fr]">
      {/* Sidebar */}
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-sm font-semibold text-slate-900">Browse lessons</div>
        <div className="mt-1 text-xs text-slate-600">
          Grade → Unit → Lesson. Score = last 20 questions.
        </div>

        <div className="mt-4 space-y-3">
          {grades.map((g) => {
            const disabled = g.grade !== 7;
            const open = selectedGrade === g.grade;
            return (
              <details
                key={g.grade}
                open={open}
                className={`rounded-2xl border ${disabled ? "border-slate-200 bg-white/50" : "border-slate-200 bg-white"}`}
                onToggle={(e) => {
                  const isOpen = (e.target as HTMLDetailsElement).open;
                  if (isOpen && !disabled) setSelectedGrade(g.grade);
                }}
              >
                <summary
                  className={`cursor-pointer list-none rounded-2xl px-3 py-2 text-sm font-semibold ${disabled ? "text-slate-400" : "text-slate-800"}`}
                  title={disabled ? "Coming soon" : undefined}
                >
                  {g.label} {disabled && <span className="ml-2 text-xs font-medium text-slate-400">(coming soon)</span>}
                </summary>

                {!disabled && (
                  <div className="px-3 pb-3">
                    <div className="space-y-2">
                      {g.units.map((u) => {
                        const unitOpen = u.id === selectedUnitId;
                        return (
                          <details
                            key={u.id}
                            open={unitOpen}
                            className="rounded-2xl border border-slate-200 bg-slate-50"
                            onToggle={(e) => {
                              const isOpen = (e.target as HTMLDetailsElement).open;
                              if (isOpen) {
                                setSelectedUnitId(u.id);
                                setSelectedLessonId(u.lessons[0]?.id || "");
                              }
                            }}
                          >
                            <summary className="cursor-pointer list-none rounded-2xl px-3 py-2">
                              <div className="text-xs font-semibold text-slate-700">{u.strand}</div>
                              <div className="text-sm font-semibold text-slate-900">{u.title}</div>
                            </summary>

                            <div className="px-2 pb-2">
                              <div className="space-y-1">
                                {u.lessons.map((l, idx) => {
                                  const unlocked = isLessonUnlocked({ tier, unit: u, lessonIndex: idx });
                                  const active = l.id === selectedLessonId;
                                  const pct = scoreLabel(l.id);
                                  return (
                                    <button
                                      key={l.id}
                                      type="button"
                                      onClick={() => {
                                        if (!unlocked) return;
                                        setSelectedUnitId(u.id);
                                        setSelectedLessonId(l.id);
                                        setActiveTab("practice");
                                      }}
                                      className={`w-full rounded-2xl border px-3 py-2 text-left text-sm transition ${
                                        active
                                          ? "border-slate-900 bg-slate-900 text-white"
                                          : unlocked
                                            ? "border-slate-200 bg-white text-slate-900 hover:bg-slate-100"
                                            : "cursor-not-allowed border-slate-200 bg-white/60 text-slate-400"
                                      }`}
                                      title={!unlocked ? "Upgrade to unlock" : l.note}
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="font-semibold">
                                          {l.title}
                                          {!unlocked && <span className="ml-2 text-xs">🔒</span>}
                                        </div>
                                        <div
                                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                            active
                                              ? "bg-white/15 text-white"
                                              : "bg-slate-100 text-slate-700"
                                          }`}
                                        >
                                          {pct}
                                        </div>
                                      </div>
                                      {l.note && unlocked && (
                                        <div className={`mt-1 text-xs ${active ? "text-white/75" : "text-slate-500"}`}>{l.note}</div>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </div>
                )}
              </details>
            );
          })}
        </div>
      </div>

      {/* Main */}
      <div className="min-w-0 space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-semibold text-slate-500">{unitDisplay}</div>
          <div className="mt-1 text-lg font-bold text-slate-900">{selectedLesson?.title || "Select a lesson"}</div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                activeTab === "practice"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
              }`}
              onClick={() => setActiveTab("practice")}
            >
              Video + Practice
            </button>
            <button
              type="button"
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                activeTab === "unit_test"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
              }`}
              onClick={() => setActiveTab("unit_test")}
            >
              Unit Test
            </button>
          </div>
        </div>

        {activeTab === "unit_test" ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <div className="text-sm font-semibold text-slate-900">Unit tests</div>
            <div className="mt-1 text-sm text-slate-600">
              Coming soon — this area will host unit tests, review packs, and printable PDFs.
            </div>
          </div>
        ) : (
          <>
            {/* Video placeholder */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <div className="text-sm font-semibold text-slate-900">Lesson video</div>
              <div className="mt-3 aspect-video w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50" />
              <div className="mt-2 text-xs text-slate-500">
                Video player placeholder (you can wire this to your hosting later).
              </div>
            </div>

            {/* Practice */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Practice</div>
                  <div className="mt-1 text-xs text-slate-600">
                    Bank remaining: <span className="font-semibold">{bankInfo.total ? `${bankInfo.remaining}/${bankInfo.total}` : "—"}</span>
                    {tier === "lessons_ai" && bankInfo.total > 0 && bankInfo.remaining === 0 && (
                      <span className="ml-2">• AI will generate similar questions ✅</span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void loadNextQuestion()}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  Next question
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                {loadingQ ? (
                  <div className="text-sm text-slate-600">Loading question…</div>
                ) : qError ? (
                  <div className="text-sm text-slate-700">{qError}</div>
                ) : question ? (
                  <div className="space-y-4">
                    <div className="text-sm font-semibold text-slate-900">
                      {question.source === "ai" && (
                        <span className="mr-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                          AI
                        </span>
                      )}
                      <span dangerouslySetInnerHTML={{ __html: question.prompt.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        disabled={!!checked}
                        placeholder={question.inputPlaceholder || "Type your answer…"}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400 disabled:bg-slate-100"
                      />
                      <button
                        type="button"
                        disabled={!!checked || !userInput.trim()}
                        onClick={() => {
                          const correct = checkAnswer(question, userInput);
                          setChecked({ correct });
                          recordAttempt(selectedLessonId, correct);
                        }}
                        className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        Check
                      </button>
                    </div>

                    {checked && (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className={`text-sm font-semibold ${checked.correct ? "text-emerald-700" : "text-rose-700"}`}>
                          {checked.correct ? "✅ Correct!" : "❌ Not quite"}
                        </div>
                        <div className="mt-2 text-sm text-slate-700" style={{ whiteSpace: "pre-wrap" }}>
                          {question.reasoning}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-slate-600">Select a lesson to begin.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
