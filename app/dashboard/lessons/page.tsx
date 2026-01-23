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
    <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
      <h1 className="text-xl font-bold text-slate-900">Lessons</h1>
      <p className="mt-2 text-slate-600">Pick a grade, strand, unit, then practice.</p>

      <div className="mt-6">
        <LessonsClient tier={tier} />
      </div>
    </div>
  );
}
