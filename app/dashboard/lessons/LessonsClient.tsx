"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import {
  GRADES_7_TO_12,
  isLessonUnlocked,
  type Tier,
  type UnitRef,
  type LessonRef,
} from "@/lib/gradeCatalog";
import { checkAnswer, getBankForLesson, type Question } from "@/lib/questionBank";

type Attempt = { correct: boolean; ts: number };

type PracticeProgress = {
  version: 1;
  updatedAt: number;
  attemptsByLesson: Record<string, Attempt[]>;
  usedBankByLesson: Record<string, string[]>;
};

function isObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeProgress(raw: unknown): PracticeProgress {
  const empty: PracticeProgress = {
    version: 1,
    updatedAt: Date.now(),
    attemptsByLesson: {},
    usedBankByLesson: {},
  };

  if (!isObject(raw)) return empty;

  const attemptsByLesson: Record<string, Attempt[]> = {};
  const usedBankByLesson: Record<string, string[]> = {};

  if (isObject(raw.attemptsByLesson)) {
    for (const [lessonId, attempts] of Object.entries(raw.attemptsByLesson)) {
      if (!Array.isArray(attempts)) continue;
      const clean = attempts
        .filter((a) => isObject(a) && typeof a.correct === "boolean" && typeof a.ts === "number")
        .map((a) => ({ correct: !!a.correct, ts: Number(a.ts) }))
        .slice(-50);
      attemptsByLesson[lessonId] = clean;
    }
  }

  if (isObject(raw.usedBankByLesson)) {
    for (const [lessonId, ids] of Object.entries(raw.usedBankByLesson)) {
      if (!Array.isArray(ids)) continue;
      usedBankByLesson[lessonId] = ids.filter((x) => typeof x === "string").slice(-300);
    }
  }

  return {
    version: 1,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    attemptsByLesson,
    usedBankByLesson,
  };
}

function pctFromAttempts(attempts: Attempt[]): number | null {
  if (!attempts || attempts.length === 0) return null;
  const last = attempts.slice(-20);
  const correct = last.filter((a) => a.correct).length;
  // Score is ALWAYS out of 20. Unanswered are treated as incorrect.
  return Math.round((correct / 20) * 100);
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

function strandLabel(strand: string) {
  const s = strand.toLowerCase();
  if (s === "number") return "Numbers";
  if (s.includes("pattern")) return "Patterns & Relations";
  if (s.includes("shape")) return "Shape & Space";
  if (s.includes("stat")) return "Statistics & Probability";
  return strand;
}

export function LessonsClient({ tier }: { tier: Tier }) {
  const { user, isLoaded } = useUser();

  const grades = GRADES_7_TO_12;
  const grade7 = grades.find((g) => g.grade === 7) || grades[0]!;
  const initialUnit = grade7.units[0];
  const initialLesson = initialUnit?.lessons[0];

  const [selectedGrade, setSelectedGrade] = useState<number>(grade7.grade);
  const [selectedStrand, setSelectedStrand] = useState<string>(initialUnit?.strand || "");
  const [selectedUnitId, setSelectedUnitId] = useState<string>(initialUnit?.id || "");
  const [selectedLessonId, setSelectedLessonId] = useState<string>(initialLesson?.id || "");

  const [activeTab, setActiveTab] = useState<"practice" | "unit_test">("practice");

  const [lessonQuery, setLessonQuery] = useState<string>("");

  const [question, setQuestion] = useState<Question | null>(null);
  const [userInput, setUserInput] = useState<string>("");
  const [checked, setChecked] = useState<null | { correct: boolean }>(null);
  const [loadingQ, setLoadingQ] = useState(false);
  const [qError, setQError] = useState<string | null>(null);
  const [bankInfo, setBankInfo] = useState<{ total: number; remaining: number }>({ total: 0, remaining: 0 });

  // Progress is stored in Clerk user unsafeMetadata (cross-device).
  const [attemptsByLesson, setAttemptsByLesson] = useState<Record<string, Attempt[]>>({});
  const [usedBankByLesson, setUsedBankByLesson] = useState<Record<string, string[]>>({});

  const attemptsRef = useRef<Record<string, Attempt[]>>({});
  const usedRef = useRef<Record<string, string[]>>({});

  useEffect(() => {
    attemptsRef.current = attemptsByLesson;
  }, [attemptsByLesson]);

  useEffect(() => {
    usedRef.current = usedBankByLesson;
  }, [usedBankByLesson]);

  // Load progress from Clerk when user is ready.
  useEffect(() => {
    if (!isLoaded || !user) return;
    const raw = (user.unsafeMetadata as any)?.practiceProgress;
    const prog = normalizeProgress(raw);
    setAttemptsByLesson(prog.attemptsByLesson);
    setUsedBankByLesson(prog.usedBankByLesson);
  }, [isLoaded, user]);

  // Batched metadata saves (avoid spamming on every keystroke).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<PracticeProgress | null>(null);

  function scheduleSave(nextAttempts?: Record<string, Attempt[]>, nextUsed?: Record<string, string[]>) {
    if (!user) return;

    const attempts = nextAttempts ?? attemptsRef.current;
    const used = nextUsed ?? usedRef.current;

    pendingSave.current = {
      version: 1,
      updatedAt: Date.now(),
      attemptsByLesson: attempts,
      usedBankByLesson: used,
    };

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const payload = pendingSave.current;
      pendingSave.current = null;
      if (!payload) return;
      try {
        // Preserve existing metadata keys.
        const currentUnsafe = (user.unsafeMetadata || {}) as Record<string, any>;
        await user.update({
          unsafeMetadata: { ...currentUnsafe, practiceProgress: payload },
        });
      } catch {
        // If saving fails (offline etc.), UI still works; it'll try again next update.
      }
    }, 600);
  }

  function recordAttempt(lessonId: string, correct: boolean) {
    setAttemptsByLesson((prev) => {
      const existing = prev[lessonId] || [];
      const next = [...existing, { correct, ts: Date.now() }].slice(-50);
      const updated = { ...prev, [lessonId]: next };
      // Instant UI update + queued Clerk save
      scheduleSave(updated, undefined);
      return updated;
    });
  }

  function scoreLabel(lessonId: string) {
    const pct = pctFromAttempts(attemptsByLesson[lessonId] || []);
    return pct === null ? "N/A" : `${pct}%`;
  }

  const recentPromptsRef = useRef<string[]>([]);
  const lastAiCallAt = useRef<number>(0);

  const selectedGradeObj = useMemo(
    () => grades.find((g) => g.grade === selectedGrade) || grade7,
    [grades, grade7, selectedGrade]
  );

  const strands = useMemo(() => {
    const map = new Map<string, UnitRef[]>();
    for (const u of selectedGradeObj.units) {
      map.set(u.strand, [...(map.get(u.strand) || []), u]);
    }
    return Array.from(map.entries()).map(([strand, units]) => ({ strand, units }));
  }, [selectedGradeObj.units]);

  const unitsInSelectedStrand = useMemo(() => {
    const group = strands.find((s) => s.strand === selectedStrand);
    return group?.units || [];
  }, [strands, selectedStrand]);

  const selectedUnit = useMemo<UnitRef | null>(() => {
    return (
      selectedGradeObj.units.find((u) => u.id === selectedUnitId) ||
      unitsInSelectedStrand[0] ||
      selectedGradeObj.units[0] ||
      null
    );
  }, [selectedGradeObj.units, selectedUnitId, unitsInSelectedStrand]);

  const selectedLesson = useMemo<LessonRef | null>(() => {
    return (
      selectedUnit?.lessons.find((l) => l.id === selectedLessonId) ||
      selectedUnit?.lessons[0] ||
      null
    );
  }, [selectedUnit, selectedLessonId]);

  // Keep selection valid when grade changes.
  useEffect(() => {
    const firstStrand = strands[0]?.strand || "";
    if (!selectedStrand || !strands.some((s) => s.strand === selectedStrand)) {
      setSelectedStrand(firstStrand);
    }

    const firstUnit = selectedGradeObj.units[0];
    if (!selectedUnitId || !selectedGradeObj.units.some((u) => u.id === selectedUnitId)) {
      if (firstUnit?.id) setSelectedUnitId(firstUnit.id);
      if (firstUnit?.lessons[0]?.id) setSelectedLessonId(firstUnit.lessons[0].id);
    }
    setLessonQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGrade]);

  // Keep unit/lesson valid when strand changes.
  useEffect(() => {
    const units = unitsInSelectedStrand;
    if (!units.length) return;
    const u = units.find((x) => x.id === selectedUnitId) || units[0]!;
    const l = u.lessons.find((x) => x.id === selectedLessonId) || u.lessons[0];

    if (u.id !== selectedUnitId) setSelectedUnitId(u.id);
    if (l?.id && l.id !== selectedLessonId) setSelectedLessonId(l.id);

    setLessonQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStrand]);

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
      // Tier gating (first lesson only per unit for free tier)
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

      // 1) Bank first
      const bank = getBankForLesson(lessonId);
      const usedIds = new Set(usedBankByLesson[lessonId] || []);

      const nextBank = bank.find((qq) => !usedIds.has(qq.id)) || null;
      const remaining = bank.filter((qq) => !usedIds.has(qq.id)).length;
      setBankInfo({ total: bank.length, remaining });

      if (nextBank) {
        setUsedBankByLesson((prev) => {
          const current = prev[lessonId] || [];
          const next = [...current, nextBank.id].slice(-300);
          const updated = { ...prev, [lessonId]: next };
          scheduleSave(undefined, updated);
          return updated;
        });

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

      // 3) No AI tier -> cycle bank
      if (bank.length > 0) {
        setUsedBankByLesson((prev) => {
          const updated = { ...prev, [lessonId]: [] };
          scheduleSave(undefined, updated);
          return updated;
        });
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

  const unitDisplay = selectedUnit ? `${strandLabel(selectedUnit.strand)} • ${selectedUnit.title}` : "";

  const filteredLessons = useMemo(() => {
    const lessons = selectedUnit?.lessons || [];
    const q = lessonQuery.trim().toLowerCase();
    if (!q) return lessons;
    return lessons.filter(
      (l) => l.title.toLowerCase().includes(q) || (l.note || "").toLowerCase().includes(q)
    );
  }, [lessonQuery, selectedUnit]);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[320px_1fr]">
      {/* Sidebar (sleek / minimal selectors) */}
      <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Lessons</div>
            <div className="mt-1 text-xs text-slate-600">Pick a grade, strand, unit, then practice.</div>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
            Score = last 20
          </div>
        </div>

        {/* Grade chips */}
        <div className="mt-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {grades.map((g) => {
              const disabled = g.grade !== 7;
              const active = selectedGrade === g.grade;
              return (
                <button
                  key={g.grade}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedGrade(g.grade)}
                  className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : disabled
                        ? "cursor-not-allowed border-slate-200 bg-white text-slate-400"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  title={disabled ? "Coming soon" : undefined}
                >
                  {g.label}
                  {disabled && <span className="ml-1">• Soon</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Strand + Unit selects */}
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-600">Strand</label>
            <select
              value={selectedStrand}
              onChange={(e) => setSelectedStrand(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
            >
              {strands.map((s) => (
                <option key={s.strand} value={s.strand}>
                  {strandLabel(s.strand)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-600">Unit</label>
            <select
              value={selectedUnitId}
              onChange={(e) => {
                setSelectedUnitId(e.target.value);
                setActiveTab("practice");
              }}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
            >
              {unitsInSelectedStrand.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Lesson list */}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold text-slate-600">Lessons</div>
            <div className="text-[11px] text-slate-500">{filteredLessons.length}/{selectedUnit?.lessons.length || 0}</div>
          </div>

          <div className="mt-2">
            <input
              value={lessonQuery}
              onChange={(e) => setLessonQuery(e.target.value)}
              placeholder="Search lessons…"
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>

          <div className="mt-3 max-h-[55vh] space-y-2 overflow-auto pr-1">
            {(filteredLessons.length ? filteredLessons : selectedUnit?.lessons || []).map((l) => {
              const unit = selectedUnit!;
              const idx = Math.max(0, unit.lessons.findIndex((x) => x.id === l.id));
              const unlocked = isLessonUnlocked({ tier, unit, lessonIndex: idx });
              const active = l.id === selectedLessonId;
              const pct = scoreLabel(l.id);

              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    if (!unlocked) return;
                    setSelectedLessonId(l.id);
                    setActiveTab("practice");
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left text-sm transition ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : unlocked
                        ? "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                        : "cursor-not-allowed border-slate-200 bg-white/60 text-slate-400"
                  }`}
                  title={!unlocked ? "Upgrade to unlock" : l.note}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={`truncate font-semibold ${active ? "text-white" : ""}`}>{l.title}</div>
                      {!unlocked && <span className="text-xs">🔒</span>}
                    </div>
                    {l.note && unlocked && (
                      <div className={`mt-0.5 truncate text-xs ${active ? "text-white/70" : "text-slate-500"}`}>{l.note}</div>
                    )}
                  </div>
                  <div className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"}`}>
                    {pct}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

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
              <div className="mt-2 text-xs text-slate-500">Video player placeholder (wire this up later).</div>
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
                      <span
                        dangerouslySetInnerHTML={{
                          __html: question.prompt.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>"),
                        }}
                      />
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

              {!isLoaded && (
                <div className="mt-3 text-xs text-slate-500">Loading your progress…</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
