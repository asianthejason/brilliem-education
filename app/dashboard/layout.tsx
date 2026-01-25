import Link from "next/link";
import { SignOutTab } from "@/components/SignOutTab";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const tabs = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/subscription", label: "Subscription" },
  { href: "/dashboard/lessons", label: "Lessons" },
  { href: "/dashboard/ai-tutor", label: "AI Tutor" },
  { href: "/dashboard/profile", label: "Profile" },
] as const;

function Tab({
  href,
  label,
  locked,
}: {
  href: string;
  label: string;
  locked: boolean;
}) {
  const allowedWhenLocked = new Set(["/dashboard", "/dashboard/subscription"]);

  // Color accents for key destinations
  const themedClass =
    href === "/dashboard/lessons"
      ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-lime-50 text-emerald-900 hover:bg-emerald-100"
      : href === "/dashboard/ai-tutor"
        ? "border-sky-200 bg-gradient-to-br from-sky-50 to-indigo-50 text-sky-900 hover:bg-sky-100"
        : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50";

  if (locked && !allowedWhenLocked.has(href)) {
    return (
      <span
        title="Select a subscription tier first."
        className="cursor-not-allowed rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-400"
      >
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${themedClass}`}
    >
      {label}
    </Link>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const meta = (user.unsafeMetadata || {}) as Record<string, any>;
  const tier = (meta.tier as string | undefined) || null;

  // Lock tabs + other pages until the user picks any tier (including "free")
  const locked = !tier;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-col gap-6">
        {locked && (
          <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-orange-50 via-pink-50 to-purple-50 p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">
              Choose a subscription tier to unlock the rest of the app
            </div>
            <div className="mt-1 text-sm text-slate-600">
              You can start with <span className="font-semibold">Free</span>, and upgrade any time.
            </div>

            <div className="mt-3">
              <Link
                href="/dashboard/subscription"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Choose a plan
              </Link>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <Tab key={t.href} href={t.href} label={t.label} locked={locked} />
          ))}
          <SignOutTab />
        </div>

        {children}
      </div>
    </div>
  );
}
