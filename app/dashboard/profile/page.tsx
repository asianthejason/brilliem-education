import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const meta = (user.unsafeMetadata || {}) as Record<string, any>;

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Profile</h1>
        <p className="mt-2 text-slate-600">
          Your account information and learning profile.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Student details</div>
          <div className="mt-4 grid gap-3 text-sm text-slate-700">
            <div><span className="font-semibold">Name:</span> {user.firstName} {user.lastName}</div>
            <div><span className="font-semibold">Email:</span> {user.emailAddresses?.[0]?.emailAddress}</div>
            <div><span className="font-semibold">Grade level:</span> {meta.gradeLevel || "—"}</div>
            <div><span className="font-semibold">School name:</span> {meta.schoolName || "—"}</div>
            <div><span className="font-semibold">City/Town:</span> {meta.city || "—"}</div>
            <div><span className="font-semibold">Province:</span> {meta.province || "—"}</div>
            <div><span className="font-semibold">Country:</span> {meta.country || "—"}</div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Plan</div>
          <div className="mt-3 text-sm text-slate-700">
            Current tier:{" "}
            <span className="font-semibold text-slate-900">
              {meta.tier || "free"}
            </span>
          </div>

          <a
            href="/get-started"
            className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Change plan / update profile
          </a>
        </div>
      </div>
    </div>
  );
}
