import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ProfileEditor } from "./profile-editor";
import { PasswordChangeCard } from "./password-change-card";

type Tier = "none" | "free" | "lessons" | "lessons_ai";

function tierLabel(tier: Tier) {
  if (tier === "none") return "No tier selected";
  if (tier === "free") return "Free";
  if (tier === "lessons") return "Lessons";
  return "Lessons + AI Tutor";
}

export default async function ProfilePage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const meta = (user.unsafeMetadata || {}) as Record<string, any>;
  const tier = ((meta.tier as Tier) || "none") as Tier;

  if (tier === "none") redirect("/dashboard");

  const initialEmail = user.emailAddresses?.[0]?.emailAddress || null;

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
            <p className="mt-2 text-slate-600">Your account information and learning profile.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Current tier:</span> {tierLabel(tier)}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ProfileEditor
          initial={{
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            email: initialEmail,
            gradeLevel: (meta.gradeLevel as string | undefined) || "",
            schoolName: (meta.schoolName as string | undefined) || "",
            city: (meta.city as string | undefined) || "",
            province: (meta.province as string | undefined) || "",
            country: (meta.country as string | undefined) || "",
          }}
        />

        <PasswordChangeCard />
      </div>
    </div>
  );
}
