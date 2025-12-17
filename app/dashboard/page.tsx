import { auth, clerkClient } from "@clerk/nextjs/server";

export default async function DashboardPage() {
  const { userId } = auth();
  const user = await clerkClient.users.getUser(userId!);

  const grade = (user.unsafeMetadata?.gradeLevel as string) || "Not set yet";

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Your Dashboard</h1>
        <p className="mt-2 text-slate-600">
          Grade level: <span className="font-semibold text-slate-900">{grade}</span>
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Progress by grade</div>
          <p className="mt-2 text-sm text-slate-600">
            Next: we’ll track mastery by unit/skill and show charts here.
          </p>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            Example: Grade 7 — 12% complete
          </div>
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
