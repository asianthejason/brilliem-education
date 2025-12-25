"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import Link from "next/link";

export function AuthModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setPassword("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isLoaded || !signIn) return;

    setSubmitting(true);
    try {
      const res = await signIn.create({
        identifier: email,
        password,
      });

      if (res.status === "complete") {
        await setActive({ session: res.createdSessionId });
        onClose();
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      // If your Clerk instance requires other factors, this will show a clear message.
      setError("This account requires additional verification to sign in.");
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        "Invalid email or password.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <button
        aria-label="Close sign in"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative mx-auto mt-16 w-[min(92vw,460px)] rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
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

        <form onSubmit={onSubmit} className="mt-5 grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-semibold text-slate-800">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-slate-400"
              placeholder="you@example.com"
              required
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold text-slate-800">Password</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-slate-400"
              placeholder="Enter your password"
              required
            />
          </label>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <button
            disabled={!isLoaded || submitting}
            className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {/* Removed: Google sign-in + removed: Sign up option */}
        <p className="mt-4 text-center text-xs text-slate-500">
          Need an account?{" "}
  <Link href="/get-started" className="font-semibold text-slate-800 underline">
    Get started
  </Link>
  .
        </p>
      </div>
    </div>
  );
}
