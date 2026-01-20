import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LessonsClient } from "./LessonsClient";

type Tier = "none" | "free" | "lessons" | "lessons_ai";

export default async function LessonsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const tier = ((user.unsafeMetadata?.tier as Tier) || "none") as Tier;

  if (tier === "none") redirect("/dashboard");

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-900">Lessons</h1>
      <p className="mt-2 text-slate-600">
        This is where the video lessons + practice questions will live.
      </p>

      {tier === "free" ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">Free tier preview</div>
          <div className="mt-1">
            You’ll have access to the <span className="font-semibold">first lesson in every unit</span> once lessons are added.
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <div className="font-semibold">Unlimited lessons</div>
          <div className="mt-1">Your plan includes full access to all lessons.</div>
        </div>
      )}

      <div className="mt-6">
        <LessonsClient tier={tier} />
      </div>
    </div>
  );
}
