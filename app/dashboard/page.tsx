"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";

type Tier = "none" | "free" | "lessons" | "lessons_ai";

function tierLabel(tier: Tier) {
  if (tier === "none") return "No tier selected";
  if (tier === "free") return "Free";
  if (tier === "lessons") return "Lessons";
  return "Lessons + AI Tutor";
}

export default function DashboardPage() {
  const { user, isLoaded } = useUser();

  const tier = ((user?.unsafeMetadata?.tier as Tier) || "none") as Tier;

  if (!isLoaded) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-slate-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Your Dashboard</h1>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Current tier:</span> {tierLabel(tier)}
          </div>
        </div>
      </div>

      {tier === "none" && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Action required</div>
          <p className="mt-2 text-sm text-slate-600">
            You haven’t selected a plan yet. Pick <span className="font-semibold">Free</span> to unlock Lessons, or
            upgrade for full access.
          </p>

          <div className="mt-4">
            <Link
              href="/dashboard/subscription"
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Go to Subscription
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Progress by grade</div>
          <p className="mt-2 text-sm text-slate-600">Next: we’ll track mastery by unit/skill and show charts here.</p>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">Example: Grade 7 — 12% complete</div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Recommended next steps</div>
          <p className="mt-2 text-sm text-slate-600">
            Next: show “continue where you left off” and weak-skill review.
          </p>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            Example: Fractions — review common denominators
          </div>
        </div>
      </div>
    </div>
  );
}
