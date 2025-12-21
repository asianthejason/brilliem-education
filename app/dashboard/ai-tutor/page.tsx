import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

type Tier = "none" | "free" | "lessons" | "lessons_ai";

export default async function AITutorPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const tier = ((user.unsafeMetadata?.tier as Tier) || "none") as Tier;

  if (tier === "none") redirect("/dashboard");

  // Only top tier can access AI Tutor
  if (tier !== "lessons_ai") redirect("/dashboard");

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-900">AI Tutor</h1>
      <p className="mt-2 text-slate-600">
        This is where the chatbox + photo homework help will live.
      </p>
    </div>
  );
}
