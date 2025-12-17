"use client";

import { useEffect } from "react";
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";

export function AuthModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <button
        aria-label="Close sign in"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative mx-auto mt-16 w-[min(92vw,460px)] rounded-3xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-slate-900">Sign in</div>
            <div className="text-sm text-slate-600">
              Continue your learning in Brilliem.
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="mt-4">
          <SignIn
            routing="hash"
            appearance={{
              elements: {
                card: "shadow-none border-none p-0",
              },
            }}
          />
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
          <div className="text-sm text-slate-700">
            Don’t have an account?
          </div>
          <Link
            href="/get-started"
            className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            onClick={onClose}
          >
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
