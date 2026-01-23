"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import {
  GRADES_7_TO_12,
  isLessonUnlocked,
  type LessonRef,
  type Tier,
  type UnitRef,
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

type RichSeg = { kind: "text" | "bold" | "italic" | "code" | "math"; content: string };

function tokenizeRichText(input: string): RichSeg[] {
  if (!input) return [];
  // Supports: **bold**, *italic*, `code`, and common math delimiters ($...$, $$...$$, \(...\), \[...\])
  const pattern =
    /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g;

  const segs: RichSeg[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(input)) !== null) {
    if (m.index > last) {
      segs.push({ kind: "text", content: input.slice(last, m.index) });
    }
    const tok = m[0];

    if (tok.startsWith("`")) {
      segs.push({ kind: "code", content: tok.slice(1, -1) });
    } else if (tok.startsWith("**")) {
      segs.push({ kind: "bold", content: tok.slice(2, -2) });
    } else if (tok.startsWith("*")) {
      segs.push({ kind: "italic", content: tok.slice(1, -1) });
    } else if (tok.startsWith("$$")) {
      segs.push({ kind: "math", content: tok.slice(2, -2) });
    } else if (tok.startsWith("$")) {
      segs.push({ kind: "math", content: tok.slice(1, -1) });
    } else if (tok.startsWith("\\[")) {
      segs.push({ kind: "math", content: tok.slice(2, -2) });
    } else if (tok.startsWith("\\(")) {
      segs.push({ kind: "math", content: tok.slice(2, -2) });
    } else {
      segs.push({ kind: "text", content: tok });
    }

    last = m.index + tok.length;
  }

  if (last < input.length) {
    segs.push({ kind: "text", content: input.slice(last) });
  }

  return segs;
}


function Fraction({
  num,
  den,
  className,
}: {
  num: string;
  den: string;
  className?: string;
}) {
  return (
    <span
      className={
        "mx-0.5 inline-flex flex-col items-center justify-center align-middle leading-none " +
        (className || "")
      }
      aria-label={`${num} over ${den}`}
    >
      <span className="text-[0.9em] leading-none">{num}</span>
      <span className="my-[1px] h-[1px] w-full bg-slate-800/60" />
      <span className="text-[0.9em] leading-none">{den}</span>
    </span>
  );
}

function renderTextWithFractions(text: string, keyPrefix: string) {
  // Match simple numeric fractions like 1/4, 12/25, 3 / 8 (1–3 digits each side).
  // Avoids dates like 2026/01 (4 digits) and avoids matching inside larger numbers.
  const fracRe = /(?<!\d)(\d{1,3})\s*\/\s*(\d{1,3})(?!\d)/g;

  const parts: Array<ReactNode> = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = fracRe.exec(text)) !== null) {
    const start = m.index ?? 0;
    const end = start + m[0].length;

    if (start > last) {
      parts.push(<span key={`${keyPrefix}-t-${last}`}>{text.slice(last, start)}</span>);
    }

    parts.push(<Fraction key={`${keyPrefix}-f-${start}`} num={m[1]} den={m[2]} />);

    last = end;
  }

  if (last < text.length) {
    parts.push(<span key={`${keyPrefix}-t-${last}`}>{text.slice(last)}</span>);
  }

  return parts;
}

function RichText({
  text,
  className,
}: {
  text?: string | null;
  className?: string;
}) {
  const segs = useMemo(() => tokenizeRichText(text || ""), [text]);

  return (
    <span className={className}>
      {segs.map((s, idx) => {
        if (s.kind === "bold") return <strong key={idx}>{renderTextWithFractions(s.content, `b-${idx}`)}</strong>;
        if (s.kind === "italic") return <em key={idx}>{renderTextWithFractions(s.content, `i-${idx}`)}</em>;
        if (s.kind === "code")
          return (
            <code
              key={idx}
              className="mx-0.5 rounded-md border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[0.95em] text-slate-900"
            >
              {s.content}
            </code>
          );
        if (s.kind === "math")
          return (
            <span
              key={idx}
              className="mx-0.5 rounded-md border border-slate-200 bg-white px-1 py-0.5 font-mono text-[0.95em] text-slate-900"
            >
              {s.content}
            </span>
          );
        return <span key={idx}>{renderTextWithFractions(s.content, `t-${idx}`)}</span>;
      })}
    </span>
  );
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
  // Always out of 20. Unanswered are treated as incorrect.
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
  // Pretty labels if you want them later.
  return strand;
}

function unitCode(unitId: string) {
  // e.g. "g7-n1" -> "N1", "g7-ss1" -> "SS1"
  return unitId.replace(/^g\d+-/i, "").toUpperCase();
}

function stripLeadingUnitCode(title: string, code: string) {
  // Many unit titles already include the code prefix, e.g. "N1: Divisibility & factors".
  // If we prepend "N1:" again in the UI, it becomes "N1: N1: ...", so strip it once.
  const re = new RegExp(`^\\s*${code}\\s*:\\s*`, "i");
  const cleaned = title.replace(re, "").trim();
  return cleaned.length ? cleaned : title;
}


export function LessonsClient({ tier }: { tier: Tier }) {
  const { user, isLoaded } = useUser();

  const grades = useMemo(() => GRADES_7_TO_12, []);
  const grade7 = grades.find((g) => g.grade === 7) || grades[0]!;

  const [selectedGrade, setSelectedGrade] = useState<number>(7);
  const selectedGradeObj = useMemo(
    () => grades.find((g) => g.grade === selectedGrade) || grade7,
    [grades, grade7, selectedGrade]
  );

  // Progress (stored in Clerk user.unsafeMetadata.practiceProgress)
  const [progress, setProgress] = useState<PracticeProgress>(() =>
    normalizeProgress(undefined)
  );
  const progressRef = useRef<PracticeProgress>(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // Debounced Clerk writes
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedAtRef = useRef<number>(0);

  const scheduleSaveToClerk = (next: PracticeProgress) => {
    if (!isLoaded || !user) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const unsafe = (user.unsafeMetadata || {}) as Record<string, any>;
        await user.update({
          unsafeMetadata: {
            ...unsafe,
            practiceProgress: next,
          },
        });
        lastSavedAtRef.current = Date.now();
      } catch {
        // If the update fails (offline etc.), we keep state and try again on next change.
      }
    }, 650);
  };

  // Hydrate progress from Clerk
  useEffect(() => {
    if (!isLoaded || !user) return;
    const raw = (user.unsafeMetadata as any)?.practiceProgress;
    const norm = normalizeProgress(raw);
    setProgress(norm);
  }, [isLoaded, user]);

  // Strand → Unit → Lesson selection
  const strands = useMemo(() => {
    const map = new Map<string, UnitRef[]>();
    for (const u of selectedGradeObj.units) {
      map.set(u.strand, [...(map.get(u.strand) || []), u]);
    }
    return Array.from(map.entries())
      .map(([strand, units]) => ({ strand, units }))
      .sort((a, b) => a.strand.localeCompare(b.strand));
  }, [selectedGradeObj.units]);

  const [selectedStrand, setSelectedStrand] = useState<string>("Numbers");
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [selectedLessonId, setSelectedLessonId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"practice" | "unit_test">("practice");

  // Grade-wide search (under Grade dropdown)
  const [gradeSearch, setGradeSearch] = useState<string>("");

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

// Sidebar collapse should only apply on large screens; auto-expand on small screens.
useEffect(() => {
  if (typeof window === "undefined") return;
  const mq = window.matchMedia("(min-width: 1024px)");
  const sync = () => {
    if (!mq.matches) setSidebarCollapsed(false);
  };
  sync();
  // Safari < 14 doesn't support addEventListener on MediaQueryList
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mql: any = mq;
  if (mql.addEventListener) mql.addEventListener("change", sync);
  else if (mql.addListener) mql.addListener(sync);
  return () => {
    if (mql.removeEventListener) mql.removeEventListener("change", sync);
    else if (mql.removeListener) mql.removeListener(sync);
  };
}, []);

  const selectedUnit = useMemo<UnitRef | null>(() => {
    return (
      selectedGradeObj.units.find((u) => u.id === selectedUnitId) ||
      selectedGradeObj.units[0] ||
      null
    );
  }, [selectedGradeObj.units, selectedUnitId]);

  const selectedLesson = useMemo<LessonRef | null>(() => {
    return (
      selectedUnit?.lessons.find((l) => l.id === selectedLessonId) ||
      selectedUnit?.lessons[0] ||
      null
    );
  }, [selectedUnit, selectedLessonId]);

  // Keep selection valid when grade changes
  useEffect(() => {
    const firstStrand = strands[0]?.strand || "";
    setSelectedStrand((prev) => (strands.some((s) => s.strand === prev) ? prev : firstStrand));
    const firstUnit = selectedGradeObj.units[0];
    if (!firstUnit) {
      setSelectedUnitId("");
      setSelectedLessonId("");
      return;
    }
    setSelectedUnitId((prev) => (selectedGradeObj.units.some((u) => u.id === prev) ? prev : firstUnit.id));
    setSelectedLessonId((prev) => {
      const u = selectedGradeObj.units.find((x) => x.id === selectedUnitId) || firstUnit;
      return u.lessons.some((l) => l.id === prev) ? prev : (u.lessons[0]?.id || "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGrade]);

  // Keep unit/lesson valid when strand changes
  useEffect(() => {
    const group = strands.find((s) => s.strand === selectedStrand);
    const units = group?.units || [];
    if (!units.length) return;
    const u = units.find((x) => x.id === selectedUnitId) || units[0]!;
    const l = u.lessons.find((x) => x.id === selectedLessonId) || u.lessons[0];
    if (u.id !== selectedUnitId) setSelectedUnitId(u.id);
    if (l?.id && l.id !== selectedLessonId) setSelectedLessonId(l.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStrand]);

  // When unit changes, ensure lesson is valid
  useEffect(() => {
    if (!selectedUnit) return;
    if (!selectedUnit.lessons.some((l) => l.id === selectedLessonId)) {
      setSelectedLessonId(selectedUnit.lessons[0]?.id || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnitId]);

  // Practice state
  const [question, setQuestion] = useState<Question | null>(null);
  const [userInput, setUserInput] = useState<string>("");
  const [checked, setChecked] = useState<null | { correct: boolean }>(null);
  const [loadingQ, setLoadingQ] = useState(false);
  const [qError, setQError] = useState<string | null>(null);
  const [bankInfo, setBankInfo] = useState<{ total: number; remaining: number }>({ total: 0, remaining: 0 });

  // AI safety throttles
  const recentPromptsRef = useRef<string[]>([]);
  const lastAiCallAt = useRef<number>(0);

  const scoreLabel = (lessonId: string) => {
    const pct = pctFromAttempts(progress.attemptsByLesson[lessonId] || []);
    return pct === null ? "N/A" : `${pct}%`;
  };

  const updateProgress = (mutator: (p: PracticeProgress) => PracticeProgress) => {
    setProgress((prev) => {
      const next = mutator(prev);
      // Always update timestamp so we can debug recency.
      const stamped = { ...next, updatedAt: Date.now() } as PracticeProgress;
      scheduleSaveToClerk(stamped);
      return stamped;
    });
  };

  function recordAttempt(lessonId: string, correct: boolean) {
    updateProgress((p) => {
      const existing = p.attemptsByLesson[lessonId] || [];
      const nextAttempts = [...existing, { correct, ts: Date.now() }].slice(-50);
      return {
        ...p,
        attemptsByLesson: { ...p.attemptsByLesson, [lessonId]: nextAttempts },
      };
    });
  }

  function recordUsedBank(lessonId: string, qid: string) {
    updateProgress((p) => {
      const existing = p.usedBankByLesson[lessonId] || [];
      const nextIds = [...existing, qid].slice(-300);
      return {
        ...p,
        usedBankByLesson: { ...p.usedBankByLesson, [lessonId]: nextIds },
      };
    });
  }

  function resetUsedBank(lessonId: string) {
    updateProgress((p) => ({
      ...p,
      usedBankByLesson: { ...p.usedBankByLesson, [lessonId]: [] },
    }));
  }

  async function loadNextQuestion() {
    const lessonId = selectedLessonId;
    if (!lessonId) return;

    setLoadingQ(true);
    setQError(null);
    setChecked(null);
    setUserInput("");

    try {
      // Tier gating (free: first lesson only per unit)
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
      const usedIds = progressRef.current.usedBankByLesson[lessonId] || [];
      const unused = bank.filter((q) => !usedIds.includes(q.id));

      if (unused.length > 0) {
        const nextQ = unused[Math.floor(Math.random() * unused.length)]!;
        setQuestion(nextQ);
        recordUsedBank(lessonId, nextQ.id);
        setBankInfo({ total: bank.length, remaining: Math.max(0, unused.length - 1) });
        return;
      }

      // 2) Bank exhausted -> AI (only lessons_ai)
      if (tier === "lessons_ai") {
        const now = Date.now();
        if (now - lastAiCallAt.current < 8000) {
          setQuestion(null);
          setBankInfo({ total: bank.length, remaining: 0 });
          setQError("Please wait a moment before generating another AI question.");
          return;
        }
        lastAiCallAt.current = now;

        const recent = recentPromptsRef.current.slice(-8);
        const aiQ = await fetchAiQuestion({ lessonId, recentPrompts: recent });
        recentPromptsRef.current = [...recent, aiQ.prompt].slice(-12);
        setQuestion(aiQ);
        setBankInfo({ total: bank.length, remaining: 0 });
        return;
      }

      // 3) No AI tier -> cycle the bank
      if (bank.length > 0) {
        resetUsedBank(lessonId);
        const first = bank[0]!;
        setQuestion(first);
        recordUsedBank(lessonId, first.id);
        setBankInfo({ total: bank.length, remaining: Math.max(0, bank.length - 1) });
        return;
      }

      setQuestion(null);
      setBankInfo({ total: 0, remaining: 0 });
      setQError("Practice bank not available yet for this lesson.");
    } catch (e: any) {
      setQuestion(null);
      setBankInfo({ total: 0, remaining: 0 });
      setQError(e?.message || "Failed to load a question");
    } finally {
      setLoadingQ(false);
    }
  }

  // Load a question when lesson changes
  useEffect(() => {
    if (!selectedLessonId) return;
    void loadNextQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLessonId]);

  // Grade-wide lesson index for search
  const allLessonsInGrade = useMemo(() => {
    const out: Array<{ strand: string; unit: UnitRef; lesson: LessonRef; lessonIndex: number }> = [];
    for (const unit of selectedGradeObj.units) {
      unit.lessons.forEach((lesson, idx) => out.push({ strand: unit.strand, unit, lesson, lessonIndex: idx }));
    }
    return out;
  }, [selectedGradeObj.units]);

  const searchMatches = useMemo(() => {
    const q = gradeSearch.trim().toLowerCase();
    if (!q) return [];
    const matches = allLessonsInGrade
      .filter(({ lesson, unit }) => {
        const hay = `${lesson.title} ${unit.title} ${unit.id}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 20);
    return matches;
  }, [allLessonsInGrade, gradeSearch]);

  const unitsInSelectedStrand = useMemo(() => {
    const group = strands.find((s) => s.strand === selectedStrand);
    return group?.units || [];
  }, [strands, selectedStrand]);

  const selectedUnitLessons = useMemo(() => selectedUnit?.lessons || [], [selectedUnit]);

  const isLessonLocked = useMemo(() => {
    if (!selectedUnit || !selectedLessonId) return false;
    const idx = selectedUnit.lessons.findIndex((l) => l.id === selectedLessonId);
    return !isLessonUnlocked({ tier, unit: selectedUnit, lessonIndex: Math.max(0, idx) });
  }, [selectedLessonId, selectedUnit, tier]);
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6">

<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
  <div>
    <h1 className="text-xl font-bold text-slate-900">Lessons</h1>
    <p className="mt-2 text-slate-600">Pick a grade, strand, unit, then practice.</p>
  </div>

  {/* Lesson header (moved beside page title) */}
  <div className="w-full lg:max-w-[520px]">
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold text-slate-500">
        {selectedStrand ? `${selectedStrand} • ` : ""}{selectedUnit ? `${unitCode(selectedUnit.id)}: ${stripLeadingUnitCode(selectedUnit.title, unitCode(selectedUnit.id))}` : ""}
      </div>
      <div className="mt-1 text-xl font-semibold text-slate-900">
        {selectedLesson?.title || "Select a lesson"}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("practice")}
          className={
            "rounded-full px-4 py-2 text-sm font-semibold transition " +
            (activeTab === "practice" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")
          }
        >
          Video + Practice
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("unit_test")}
          className={
            "rounded-full px-4 py-2 text-sm font-semibold transition " +
            (activeTab === "unit_test" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")
          }
        >
          Unit Test
        </button>
      </div>
    </div>
  </div>
</div>

<div
  className={
    "mt-6 grid grid-cols-1 gap-6 " +
    (sidebarCollapsed ? "lg:grid-cols-[64px_1fr]" : "lg:grid-cols-[360px_1fr]")
  }
>
        {/* Sidebar */}
        <div className={"sticky top-6 self-start rounded-3xl border border-slate-200 bg-white shadow-sm " + (sidebarCollapsed ? "p-2" : "p-4")}>
          <div className="relative">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              className="absolute right-0 top-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? "›" : "‹"}
            </button>
          </div>

          {sidebarCollapsed ? (
            <div className="flex h-full min-h-[420px] items-center justify-center">
              <div className="select-none text-xs font-semibold text-slate-500 [writing-mode:vertical-rl]">
                Filters
              </div>
            </div>
          ) : (
            <>
              <div className="mt-4 space-y-4">
            {/* Grade */}
            <div>
              <label className="text-xs font-semibold text-slate-600">Grade</label>
              <select
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-300"
                value={selectedGrade}
                onChange={(e) => {
                  const g = Number(e.target.value);
                  setSelectedGrade(g);
                  setGradeSearch("");
                }}
              >
                {grades.map((g) => {
                  const comingSoon = g.units.length === 0;
                  return (
                    <option key={g.grade} value={g.grade} disabled={comingSoon}>
                      Grade {g.grade}{comingSoon ? " (coming soon)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Grade-wide search */}
            <div>
              <label className="text-xs font-semibold text-slate-600">Search lessons</label>
              <input
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300"
                placeholder={`Search Grade ${selectedGrade} lessons...`}
                value={gradeSearch}
                onChange={(e) => setGradeSearch(e.target.value)}
              />
              {gradeSearch.trim() && (
                <div className="mt-2 text-xs text-slate-500">
                  Showing {searchMatches.length} result{searchMatches.length === 1 ? "" : "s"}.
                </div>
              )}
            </div>

            {/* Strand */}
            <div>
              <label className="text-xs font-semibold text-slate-600">Strand</label>
              <select
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-300"
                value={selectedStrand}
                onChange={(e) => setSelectedStrand(e.target.value)}
              >
                {strands.map((s) => (
                  <option key={s.strand} value={s.strand}>
                    {strandLabel(s.strand)}
                  </option>
                ))}
              </select>
            </div>

            {/* Unit */}
            <div>
              <label className="text-xs font-semibold text-slate-600">Unit</label>
              <select
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-300"
                value={selectedUnitId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedUnitId(id);
                  // default to first lesson in unit
                  const u = selectedGradeObj.units.find((x) => x.id === id);
                  if (u?.lessons[0]?.id) setSelectedLessonId(u.lessons[0].id);
                }}
              >
                {unitsInSelectedStrand.map((u) => (
                  <option key={u.id} value={u.id}>
                    {unitCode(u.id)}: {stripLeadingUnitCode(u.title, unitCode(u.id))}
                  </option>
                ))}
              </select>
            </div>

            {/* Lessons list */}
            <div>
              <div className="flex items-start justify-between">
                <div className="flex flex-col">
                  <div className="text-xs font-semibold text-slate-600">Lessons</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">% is calculated using last 20 responses.</div>
                </div>
                {!gradeSearch.trim() && (
                  <div className="text-xs text-slate-500">
                    {selectedUnitLessons.length}/{selectedUnitLessons.length}
                  </div>
                )}
              </div>

              <div className="mt-2 space-y-2">
                {(gradeSearch.trim() ? searchMatches.map((m) => m.lesson) : selectedUnitLessons).map((lesson) => {
                  const active = lesson.id === selectedLessonId;
                  const pct = scoreLabel(lesson.id);

                  // Lock status only meaningful when this lesson belongs to the selected unit.
                  // For search results, we compute against its unit index.
                  const lockInfo = gradeSearch.trim()
                    ? searchMatches.find((x) => x.lesson.id === lesson.id)
                    : null;

                  const locked = lockInfo
                    ? !isLessonUnlocked({ tier, unit: lockInfo.unit, lessonIndex: lockInfo.lessonIndex })
                    : selectedUnit
                      ? !isLessonUnlocked({
                          tier,
                          unit: selectedUnit,
                          lessonIndex: Math.max(0, selectedUnit.lessons.findIndex((l) => l.id === lesson.id)),
                        })
                      : false;

                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => {
                        if (gradeSearch.trim()) {
                          const hit = searchMatches.find((x) => x.lesson.id === lesson.id);
                          if (hit) {
                            setSelectedStrand(hit.strand);
                            setSelectedUnitId(hit.unit.id);
                            setSelectedLessonId(hit.lesson.id);
                          }
                        } else {
                          setSelectedLessonId(lesson.id);
                        }
                      }}
                      className={
                        "group w-full rounded-2xl border px-3 py-3 text-left transition " +
                        (active
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-900 hover:border-slate-300")
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div
                            className={
                              "truncate text-sm font-semibold " +
                              (active ? "text-white" : "text-slate-900")
                            }
                          >
                            {lesson.title}
                          </div>
                          {gradeSearch.trim() && (() => {
                            const hit = searchMatches.find((x) => x.lesson.id === lesson.id);
                            if (!hit) return null;
                            return (
                              <div className={"mt-0.5 truncate text-xs " + (active ? "text-slate-200" : "text-slate-500")}>
                                {hit.unit.id}: {hit.unit.title}
                              </div>
                            );
                          })()}
                        </div>
                        <div
                          className={
                            "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold " +
                            (active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700")
                          }
                        >
                          {pct}
                        </div>
                      </div>
                      {locked && (
                        <div className={"mt-2 text-xs " + (active ? "text-slate-200" : "text-slate-500")}>
                          Locked on your plan
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 text-[11px] leading-relaxed text-slate-500">
            Progress syncs to your account. Last saved {lastSavedAtRef.current ? `${Math.max(1, Math.round((Date.now() - lastSavedAtRef.current) / 1000))}s ago` : "soon"}.
          </div>
            </>
          )}
        </div>

        {/* Main */}
        <div className="space-y-6">
          {activeTab === "unit_test" ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-lg font-semibold text-slate-900">Unit test</div>
              <div className="mt-2 text-sm text-slate-600">
                Coming soon. This will contain a full assessment for the unit, with automatic grading.
              </div>
            </div>
          ) : (
            <>
              {/* Video placeholder */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">Lesson video</div>
                <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
                  Video player placeholder (wire this to your hosting later)
                </div>
              </div>

              {/* Practice */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">Practice</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Bank remaining: {bankInfo.remaining}/{bankInfo.total}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadNextQuestion()}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
                    disabled={loadingQ}
                  >
                    Next question
                  </button>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  {loadingQ ? (
                    <div className="text-sm text-slate-600">Loading question…</div>
                  ) : qError ? (
                    <div className="text-sm text-slate-700">{qError}</div>
                  ) : !question ? (
                    <div className="text-sm text-slate-600">No question available.</div>
                  ) : (
                    <>
                      <div className="text-sm font-semibold text-slate-900"><RichText text={question.prompt} /></div>
                      <div className="mt-3 flex gap-2">
                        <input
                          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-300"
                          placeholder={question.inputPlaceholder || "Type your answer…"}
                          value={userInput}
                          onChange={(e) => setUserInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const ok = checkAnswer(question, userInput);
                              setChecked({ correct: ok });
                              // Instant score update
                              recordAttempt(question.lessonId, ok);
                            }
                          }}
                          disabled={isLessonLocked}
                        />
                        <button
                          type="button"
                          className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300"
                          disabled={!userInput.trim() || !!checked || isLessonLocked}
                          onClick={() => {
                            const ok = checkAnswer(question, userInput);
                            setChecked({ correct: ok });
                            // Instant score update
                            recordAttempt(question.lessonId, ok);
                          }}
                        >
                          Check
                        </button>
                      </div>

                      {checked && (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-sm font-semibold text-slate-900">
                            {checked.correct ? "✅ Correct" : "❌ Not quite"}
                          </div>
                          <div className="mt-2 text-sm text-slate-700"><RichText text={question.reasoning} /></div>
                        </div>
                      )}

                      {isLessonLocked && (
                        <div className="mt-3 text-sm text-slate-600">
                          This lesson is locked on your current plan.
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default LessonsClient;

