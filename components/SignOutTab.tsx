"use client";

import { useClerk } from "@clerk/nextjs";

export function SignOutTab() {
  const { signOut } = useClerk();

  return (
    <button
      type="button"
      onClick={() => (signOut as any)({ redirectUrl: "/" })}
      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
    >
      Sign out
    </button>
  );
}
