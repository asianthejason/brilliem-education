"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { GRADES_7_TO_12, type GradeRef, type UnitRef } from "@/lib/gradeCatalog";

type Attempt = { correct: boolean; ts: number };

type PracticeProgress = {
  version: 1;
  updatedAt: number;
  attemptsByLesson: Record<string, Attempt[]>;
};

function isObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeProgress(raw: unknown): PracticeProgress {
  const empty: PracticeProgress = {
    version: 1,
    updatedAt: Date.now(),
    attemptsByLesson: {},
  };

  if (!isObject(raw)) return empty;

  const attemptsByLesson: Record<string, Attempt[]> = {};
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

  return {
    version: 1,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    attemptsByLesson,
  };
}

function pctFromAttempts(attempts: Attempt[]): number | null {
  if (!attempts || attempts.length === 0) return null;
  const last = attempts.slice(-20);
  const correct = last.filter((a) => a.correct).length;
  // Always out of 20. Unanswered are treated as incorrect.
  return Math.round((correct / 20) * 100);
}

function unitCode(unitId: string) {
  return unitId.replace(/^g\d+-/i, "").toUpperCase();
}

function stripLeadingUnitCode(title: string, code: string) {
  const re = new RegExp(`^\\s*${code}\\s*:\\s*`, "i");
  const cleaned = title.replace(re, "").trim();
  return cleaned.length ? cleaned : title;
}

function clampPct(p: number) {
  if (Number.isNaN(p)) return 0;
  return Math.max(0, Math.min(100, Math.round(p)));
}

function scoreChipClass(pct: number) {
  const p = clampPct(pct);
  if (p >= 85) return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  if (p >= 70) return "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
  if (p >= 50) return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
  return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
}

type LessonStats = {
  lessonId: string;
  pct: number | null; // null = no attempts yet
};

type UnitStats = {
  unit: UnitRef;
  unitPct: number; // includes unattempted lessons as 0%
  startedLessons: number;
  lessons: LessonStats[];
  hasActivity: boolean;
};

type StrandStats = {
  strand: string;
  strandPct: number; // includes unstarted units as 0%
  startedUnits: number;
  totalUnits: number;
  units: UnitStats[];
  hasActivity: boolean;
};

type GradeStats = {
  grade: GradeRef;
  gradePct: number; // includes unstarted strands as 0%
  startedStrands: number;
  totalStrands: number;
  strands: StrandStats[];
  hasActivity: boolean;
};

function computeUnitStats(unit: UnitRef, lessonPctById: Record<string, number | null>): UnitStats {
  const lessons: LessonStats[] = unit.lessons.map((l) => ({
    lessonId: l.id,
    pct: lessonPctById[l.id] ?? null,
  }));

  const startedLessons = lessons.filter((l) => l.pct !== null).length;
  const hasActivity = startedLessons > 0;

  const sum = lessons.reduce((acc, l) => acc + (l.pct ?? 0), 0);
  const unitPct = unit.lessons.length ? Math.round(sum / unit.lessons.length) : 0;

  return {
    unit,
    unitPct,
    startedLessons,
    lessons,
    hasActivity,
  };
}

function computeGradeStats(grade: GradeRef, lessonPctById: Record<string, number | null>): GradeStats {
  const strandMap = new Map<string, UnitRef[]>();
  for (const u of grade.units) {
    strandMap.set(u.strand, [...(strandMap.get(u.strand) || []), u]);
  }

  const strandNames = Array.from(strandMap.keys()).sort((a, b) => a.localeCompare(b));

  const strands: StrandStats[] = strandNames.map((strand) => {
    const units = (strandMap.get(strand) || []).slice();
    const unitStatsAll = units.map((u) => computeUnitStats(u, lessonPctById));

    const startedUnits = unitStatsAll.filter((u) => u.hasActivity).length;
    const hasActivity = startedUnits > 0;

    // Strand % averages ALL units in the strand (unstarted units count as 0%).
    const sum = unitStatsAll.reduce((acc, u) => acc + (u.hasActivity ? u.unitPct : 0), 0);
    const strandPct = unitStatsAll.length ? Math.round(sum / unitStatsAll.length) : 0;

    return {
      strand,
      strandPct,
      startedUnits,
      totalUnits: unitStatsAll.length,
      units: unitStatsAll,
      hasActivity,
    };
  });

  const startedStrands = strands.filter((s) => s.hasActivity).length;
  const hasActivity = startedStrands > 0;

  // Grade % averages ALL strands in the grade (unstarted strands count as 0%).
  const sum = strands.reduce((acc, s) => acc + (s.hasActivity ? s.strandPct : 0), 0);
  const gradePct = strands.length ? Math.round(sum / strands.length) : 0;

  return {
    grade,
    gradePct,
    startedStrands,
    totalStrands: strands.length,
    strands,
    hasActivity,
  };
}

function ProgressBar({ pct }: { pct: number }) {
  const p = clampPct(pct);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
      <div className="h-full rounded-full bg-slate-900" style={{ width: `${p}%` }} />
    </div>
  );
}

export default function DashboardPage() {
  const { user, isLoaded } = useUser();

  const [openStrands, setOpenStrands] = useState<Record<string, boolean>>({});
  const [openUnits, setOpenUnits] = useState<Record<string, boolean>>({});

  const progress = useMemo(() => {
    const raw = (user?.unsafeMetadata as any)?.practiceProgress;
    return normalizeProgress(raw);
  }, [user]);

  const lastUpdated = useMemo(() => {
    try {
      return new Date(progress.updatedAt).toLocaleString();
    } catch {
      return "";
    }
  }, [progress.updatedAt]);

  const lessonPctById = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const [lessonId, attempts] of Object.entries(progress.attemptsByLesson || {})) {
      out[lessonId] = pctFromAttempts(attempts || []);
    }
    return out;
  }, [progress.attemptsByLesson]);

  const gradeStats = useMemo(() => {
    const stats = GRADES_7_TO_12.map((g) => computeGradeStats(g, lessonPctById));
    return stats.filter((g) => g.hasActivity && g.grade.units.length > 0);
  }, [lessonPctById]);

  // Keep open state stable but avoid keys hanging around forever.
  useEffect(() => {
    const strandKeys = new Set<string>();
    const unitKeys = new Set<string>();
    for (const g of gradeStats) {
      for (const s of g.strands) {
        strandKeys.add(`${g.grade.grade}::${s.strand}`);
        for (const u of s.units) unitKeys.add(u.unit.id);
      }
    }
    setOpenStrands((prev) => {
      const next: Record<string, boolean> = {};
      for (const k of strandKeys) if (prev[k]) next[k] = true;
      return next;
    });
    setOpenUnits((prev) => {
      const next: Record<string, boolean> = {};
      for (const k of unitKeys) if (prev[k]) next[k] = true;
      return next;
    });
  }, [gradeStats]);

  if (!isLoaded) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-slate-600">Loading…</div>
      </div>
    );
  }

  const empty = gradeStats.length === 0;

  return (
    <div className="grid gap-6">
      {/* Header */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Progress</h1>
            <p className="mt-2 text-slate-600">
              Grades use your last <span className="font-semibold">20</span> practice attempts per lesson.
            </p>
          </div>

          <div className="flex flex-col gap-2 md:items-end">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">Last updated:</span> {lastUpdated}
            </div>
            <div className="text-xs text-slate-500">
              Unstarted lessons/units/strands count as <span className="font-semibold">0%</span> in roll‑ups.
            </div>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {empty && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">No progress yet</div>
          <p className="mt-2 text-sm text-slate-600">
            Once you start practicing lessons, your dashboard will show strand, unit, and lesson grades here.
          </p>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            Tip: do a quick practice set in any lesson to initialize your grades.
          </div>
        </div>
      )}

      {/* Grades */}
      {!empty && (
        <div className="grid gap-6">
          {gradeStats.map((g) => {
            return (
              <div key={g.grade.grade} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-lg font-bold text-slate-900">{g.grade.label}</div>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${scoreChipClass(g.gradePct)}`}
                    >
                      {clampPct(g.gradePct)}%
                    </span>
                  </div>
                  <div className="text-sm text-slate-600">
                    {g.startedStrands}/{g.totalStrands} strands started
                  </div>
                </div>

                <div className="mt-4">
                  <ProgressBar pct={g.gradePct} />
                </div>

                {/* Strand cards */}
                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  {g.strands
                    .filter((s) => s.hasActivity)
                    .map((s) => {
                      const strandKey = `${g.grade.grade}::${s.strand}`;
                      const open = !!openStrands[strandKey];

                      return (
                        <div
                          key={strandKey}
                          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setOpenStrands((prev) => ({ ...prev, [strandKey]: !prev[strandKey] }))
                            }
                            className="flex w-full items-start justify-between gap-4 text-left"
                            aria-expanded={open}
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">{s.strand}</div>
                              <div className="mt-1 text-xs text-slate-600">
                                {s.startedUnits}/{s.totalUnits} units started
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <span
                                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${scoreChipClass(s.strandPct)}`}
                              >
                                {clampPct(s.strandPct)}%
                              </span>
                              <span className="text-xs text-slate-500">{open ? "Hide" : "Details"}</span>
                            </div>
                          </button>

                          <div className="mt-3">
                            <ProgressBar pct={s.strandPct} />
                          </div>

                          {open && (
                            <div className="mt-4 grid gap-3">
                              {s.units
                                .filter((u) => u.hasActivity)
                                .sort((a, b) => a.unit.id.localeCompare(b.unit.id))
                                .map((u) => {
                                  const code = unitCode(u.unit.id);
                                  const title = stripLeadingUnitCode(u.unit.title, code);
                                  const unitOpen = !!openUnits[u.unit.id];

                                  return (
                                    <div
                                      key={u.unit.id}
                                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                                    >
                                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                                              {code}
                                            </span>
                                            <div className="truncate text-sm font-semibold text-slate-900">
                                              {title}
                                            </div>
                                          </div>
                                          <div className="mt-1 text-xs text-slate-600">
                                            {u.startedLessons}/{u.unit.lessons.length} lessons started
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                          <span
                                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${scoreChipClass(u.unitPct)}`}
                                          >
                                            {clampPct(u.unitPct)}%
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setOpenUnits((prev) => ({ ...prev, [u.unit.id]: !prev[u.unit.id] }))
                                            }
                                            className="text-xs font-semibold text-slate-700 hover:text-slate-900"
                                          >
                                            {unitOpen ? "Hide lessons" : "Show lessons"}
                                          </button>
                                        </div>
                                      </div>

                                      <div className="mt-3">
                                        <ProgressBar pct={u.unitPct} />
                                      </div>

                                      {unitOpen && (
                                        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                                          <div className="grid grid-cols-12 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700">
                                            <div className="col-span-9">Lesson</div>
                                            <div className="col-span-3 text-right">Grade</div>
                                          </div>

                                          <div className="divide-y divide-slate-200">
                                            {u.unit.lessons
                                              .map((l) => ({
                                                id: l.id,
                                                title: l.title,
                                                pct: lessonPctById[l.id] ?? null,
                                              }))
                                              .filter((l) => l.pct !== null)
                                              .map((l) => (
                                                <div
                                                  key={l.id}
                                                  className="grid grid-cols-12 items-center gap-2 px-4 py-3"
                                                >
                                                  <div className="col-span-9 min-w-0 truncate text-sm text-slate-900">
                                                    {l.title}
                                                  </div>
                                                  <div className="col-span-3 flex justify-end">
                                                    <span
                                                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${scoreChipClass(l.pct ?? 0)}`}
                                                    >
                                                      {clampPct(l.pct ?? 0)}%
                                                    </span>
                                                  </div>
                                                </div>
                                              ))}
                                          </div>

                                          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
                                            Unit grade includes all lessons (unstarted lessons count as 0%).
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}

                              <div className="text-xs text-slate-600">
                                Strand grade averages all units in this strand (unstarted units count as 0%).
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>

                <div className="mt-5 text-xs text-slate-600">
                  Grade grade averages all strands in this grade (unstarted strands count as 0%).
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
