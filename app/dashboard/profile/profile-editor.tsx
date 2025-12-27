"use client";

import * as React from "react";
import { useUser } from "@clerk/nextjs";

type ProfileEditorProps = {
  initial: {
    firstName: string;
    lastName: string;
    email: string | null;
    gradeLevel: string;
    schoolName: string;
    city: string;
    province: string;
    country: string;
  };
};

function pickClerkErrorMessage(err: unknown): string {
  const anyErr = err as any;
  const fromClerk = anyErr?.errors?.[0]?.longMessage || anyErr?.errors?.[0]?.message;
  if (typeof fromClerk === "string" && fromClerk.trim()) return fromClerk;
  if (typeof anyErr?.message === "string" && anyErr.message.trim()) return anyErr.message;
  return "Something went wrong. Please try again.";
}

export function ProfileEditor({ initial }: ProfileEditorProps) {
  const { isLoaded, user } = useUser();

  const [firstName, setFirstName] = React.useState(initial.firstName);
  const [lastName, setLastName] = React.useState(initial.lastName);
  const [gradeLevel, setGradeLevel] = React.useState(initial.gradeLevel);
  const [schoolName, setSchoolName] = React.useState(initial.schoolName);
  const [city, setCity] = React.useState(initial.city);
  const [province, setProvince] = React.useState(initial.province);
  const [country, setCountry] = React.useState(initial.country);

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!isLoaded || !user) return;

    const fn = firstName.trim();
    const ln = lastName.trim();

    if (!fn || !ln) {
      setError("Please enter both a first name and last name.");
      return;
    }

    setSaving(true);
    try {
      const existingUnsafe = (user.unsafeMetadata || {}) as Record<string, any>;

      await user.update({
        firstName: fn,
        lastName: ln,
        unsafeMetadata: {
          ...existingUnsafe,
          gradeLevel: gradeLevel.trim(),
          schoolName: schoolName.trim(),
          city: city.trim(),
          province: province.trim(),
          country: country.trim(),
        },
      });

      setSuccess("Saved.");
    } catch (err) {
      setError(pickClerkErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-900">Student details</div>
          <div className="mt-1 text-sm text-slate-600">Update your learning profile.</div>
        </div>
      </div>

      <form onSubmit={onSave} className="mt-5 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-700">First name</span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              autoComplete="given-name"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-700">Last name</span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              autoComplete="family-name"
            />
          </label>
        </div>

        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-700">Email</span>
          <input
            value={initial.email ?? ""}
            readOnly
            className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
          />
          <span className="text-xs text-slate-500">
            Email changes are managed by Clerk.
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-700">Grade level</span>
            <input
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              placeholder="e.g. Grade 8"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-700">School name</span>
            <input
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-700">City / Town</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-700">Province / State</span>
            <input
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
          </label>
        </div>

        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-700">Country</span>
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="Optional"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
          />
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

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!isLoaded || saving}
            className={
              "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white " +
              (saving || !isLoaded ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800")
            }
          >
            {saving ? "Saving…" : "Save changes"}
          </button>

          <button
            type="button"
            onClick={() => {
              setFirstName(initial.firstName);
              setLastName(initial.lastName);
              setGradeLevel(initial.gradeLevel);
              setSchoolName(initial.schoolName);
              setCity(initial.city);
              setProvince(initial.province);
              setCountry(initial.country);
              setError(null);
              setSuccess(null);
            }}
            className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Reset
          </button>
        </div>

        <div className="text-xs text-slate-500">
          Tip: If saving your name fails, enable <span className="font-semibold">Users can set their first and last name</span> in your Clerk dashboard.
        </div>
      </form>
    </div>
  );
}
