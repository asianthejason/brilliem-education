"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";

import {
  GRADES_7_TO_12,
  type GradeRef,
  type LessonRef,
  type UnitRef,
} from "@/lib/gradeCatalog";

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

function avgRounded(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function percentBadgeClass(pct: number) {
  if (pct >= 85) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (pct >= 70) return "bg-sky-50 text-sky-700 border-sky-200";
  if (pct >= 50) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

type LessonRow = { lesson: LessonRef; pct: number };
type UnitRow = {
  unit: UnitRef;
  unitPct: number;
  activeLessons: LessonRow[];
  isActive: boolean;
};
type StrandRow = {
  strand: string;
  strandPct: number;
  activeUnits: UnitRow[];
  isActive: boolean;
};
type GradeRow = {
  grade: GradeRef;
  gradePct: number;
  activeStrands: StrandRow[];
  isActive: boolean;
};

function buildDashboardRows(grades: GradeRef[], progress: PracticeProgress): GradeRow[] {
  const lessonPct = (lessonId: string) =>
    pctFromAttempts(progress.attemptsByLesson[lessonId] || []);

  return grades
    .map((g): GradeRow => {
      // Group units by strand (keep a deterministic order).
      const strandNames = Array.from(new Set(g.units.map((u) => u.strand))).sort((a, b) =>
        a.localeCompare(b)
      );

      const strands: StrandRow[] = strandNames.map((strandName) => {
        const unitsInStrand = g.units.filter((u) => u.strand === strandName);

        const unitRows: UnitRow[] = unitsInStrand.map((unit) => {
          const activeLessons: LessonRow[] = unit.lessons
            .map((lesson) => {
              const pct = lessonPct(lesson.id);
              return pct === null ? null : { lesson, pct };
            })
            .filter(Boolean) as LessonRow[];

          const allLessonPctsForAvg = unit.lessons.map((l) => lessonPct(l.id) ?? 0);
          const unitPct = avgRounded(allLessonPctsForAvg);

          return {
            unit,
            unitPct,
            activeLessons,
            isActive: activeLessons.length > 0,
          };
        });

        const strandPct = avgRounded(unitRows.map((u) => u.unitPct));
        const activeUnits = unitRows.filter((u) => u.isActive);

        return {
          strand: strandName,
          strandPct,
          activeUnits,
          isActive: activeUnits.length > 0,
        };
      });

      const gradePct = avgRounded(strands.map((s) => s.strandPct));
      const activeStrands = strands.filter((s) => s.isActive);
      const isActive = activeStrands.length > 0;

      return {
        grade: g,
        gradePct,
        activeStrands,
        isActive,
      };
    })
    .filter((g) => g.isActive);
}

export default function DashboardPage() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-slate-600">Loading…</div>
      </div>
    );
  }

  const raw = (user?.unsafeMetadata as any)?.practiceProgress;
  const progress = normalizeProgress(raw);
  const rows = buildDashboardRows(GRADES_7_TO_12, progress);
  const hasAnyProgress = rows.length > 0;

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Your Dashboard</h1>
            <p className="mt-2 text-slate-600">
              Your progress is calculated from the last <span className="font-semibold">20</span> practice attempts per
              lesson.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Last updated:</span>{" "}
            {progress.updatedAt ? new Date(progress.updatedAt).toLocaleString() : "—"}
          </div>
        </div>
      </div>

      {!hasAnyProgress ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">No progress yet</div>
          <p className="mt-2 text-sm text-slate-600">
            Start practicing lessons, and we’ll show your grades here by grade → strand → unit → lesson.
          </p>
          <div className="mt-4">
            <Link
              href="/dashboard/lessons"
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Go to Lessons
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-6">
          {rows.map((g) => (
            <div key={g.grade.grade} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-lg font-semibold text-slate-900">{g.grade.label}</div>
                  <span
                    className={
                      "inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold " +
                      percentBadgeClass(g.gradePct)
                    }
                  >
                    {g.gradePct}%
                  </span>
                </div>
                <div className="text-sm text-slate-600">
                  {g.activeStrands.length} strand{g.activeStrands.length === 1 ? "" : "s"} in progress
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                {g.activeStrands.map((s) => (
                  <details
                    key={s.strand}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4 open:bg-white"
                    open
                  >
                    <summary className="cursor-pointer list-none select-none">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="font-semibold text-slate-900">{s.strand}</div>
                          <span
                            className={
                              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold " +
                              percentBadgeClass(s.strandPct)
                            }
                          >
                            {s.strandPct}%
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">Click to collapse</div>
                      </div>
                    </summary>

                    <div className="mt-4 grid gap-3">
                      {s.activeUnits.map((u) => (
                        <div key={u.unit.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-center gap-3">
                              <div className="font-semibold text-slate-900">{u.unit.title}</div>
                              <span
                                className={
                                  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold " +
                                  percentBadgeClass(u.unitPct)
                                }
                              >
                                {u.unitPct}%
                              </span>
                            </div>
                            <div className="text-xs text-slate-500">
                              Unit grade is the average of <span className="font-semibold">all</span> lessons in this unit
                              (unstarted lessons count as 0%).
                            </div>
                          </div>

                          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                            <div className="max-h-[320px] overflow-auto">
                              <table className="w-full text-left text-sm">
                                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-600">
                                  <tr>
                                    <th className="px-3 py-2 font-semibold">Lesson</th>
                                    <th className="px-3 py-2 text-right font-semibold">Grade</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                  {u.activeLessons.map((lr) => (
                                    <tr key={lr.lesson.id} className="bg-white">
                                      <td className="px-3 py-2 text-slate-900">{lr.lesson.title}</td>
                                      <td className="px-3 py-2 text-right">
                                        <span
                                          className={
                                            "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold " +
                                            percentBadgeClass(lr.pct)
                                          }
                                        >
                                          {lr.pct}%
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
