"use client";

import * as React from "react";
import { useUser } from "@clerk/nextjs";

function pickClerkErrorMessage(err: unknown): string {
  const anyErr = err as any;
  const fromClerk = anyErr?.errors?.[0]?.longMessage || anyErr?.errors?.[0]?.message;
  if (typeof fromClerk === "string" && fromClerk.trim()) return fromClerk;
  if (typeof anyErr?.message === "string" && anyErr.message.trim()) return anyErr.message;
  return "Something went wrong. Please try again.";
}

export function PasswordChangeCard() {
  const { isLoaded, user } = useUser();

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [signOutOtherSessions, setSignOutOtherSessions] = React.useState(true);

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!isLoaded || !user) return;

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      await user.updatePassword({
        currentPassword: currentPassword.trim() ? currentPassword : undefined,
        newPassword,
        signOutOfOtherSessions: signOutOtherSessions,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Password updated.");
    } catch (err) {
      setError(pickClerkErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <div className="text-sm font-semibold text-slate-900">Password</div>
        <div className="mt-1 text-sm text-slate-600">Change your account password.</div>
      </div>

      <form onSubmit={onSubmit} className="mt-5 grid gap-4">
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-700">Current password</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder=""
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            autoComplete="current-password"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-700">New password</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            autoComplete="new-password"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-700">Confirm new password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            autoComplete="new-password"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={signOutOtherSessions}
            onChange={(e) => setSignOutOtherSessions(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Sign out of other devices
        </label>

        {(error || success) && (
          <div
            className={
              "rounded-2xl border px-4 py-3 text-sm " +
              (error
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700")
            }
          >
            {error ?? success}
          </div>
        )}

        <button
          type="submit"
          disabled={!isLoaded || saving}
          className={
            "inline-flex w-full items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white " +
            (saving || !isLoaded ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800")
          }
        >
          {saving ? "Updating…" : "Update password"}
        </button>

      </form>
    </div>
  );
}
