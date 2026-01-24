"use client";

import { useClerk } from "@clerk/nextjs";

export function SignOutTab() {
  const { signOut } = useClerk();

  return (
    <button
      type="button"
      onClick={() => (signOut as any)({ redirectUrl: "/" })}
      // `ml-auto` pushes the button to the far right in the dashboard nav bar.
      className="ml-auto rounded-full border border-red-600 bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:border-red-700 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
    >
      Sign out
    </button>
  );
}
