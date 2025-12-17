"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SignUp, useUser } from "@clerk/nextjs";

type Mode = "signup" | "onboarding";
type Tier = "free" | "lessons" | "lessons_ai";

const TIERS: Array<{
  id: Tier;
  name: string;
  price: string;
  bullets: string[];
  accent: string;
}> = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    bullets: ["Explore sample lessons", "Try practice questions", "Basic progress"],
    accent: "from-emerald-500 to-green-500",
  },
  {
    id: "lessons",
    name: "Lessons",
    price: "$9.99/mo",
    bullets: ["Full lessons library", "Unlimited practice", "Unit tests"],
    accent: "from-sky-500 to-blue-600",
  },
  {
    id: "lessons_ai",
    name: "Lessons + AI Tutor",
    price: "$14.99/mo",
    bullets: ["Everything in Lessons", "AI Tutor chat", "Photo homework help"],
    accent: "from-purple-500 to-fuchsia-600",
  },
];

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold text-slate-800">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
      />
    </label>
  );
}

export function GetStartedClient({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const canceled = params.get("canceled") === "1";
  const { user } = useUser();

  const [tier, setTier] = useState<Tier>("free");
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [country, setCountry] = useState("Canada");
  const [gradeLevel, setGradeLevel] = useState("");

  const paid = useMemo(() => tier !== "free", [tier]);
  const [loading, setLoading] = useState(false);

  async function saveProfileAndTier() {
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tier,
        firstName,
        lastName,
        city,
        province,
        country,
        gradeLevel,
      }),
    });
    if (!res.ok) throw new Error("Failed to save profile");
  }

  async function startCheckout() {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    });
    const data = (await res.json()) as { url?: string };
    if (!data.url) throw new Error("Missing checkout URL");
    window.location.href = data.url;
  }

  async function onSubmit() {
    setLoading(true);
    try {
      await saveProfileAndTier();

      if (paid) {
        await startCheckout(); // Stripe-hosted payment method box
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      alert("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-14">
      <div className="grid gap-10 md:grid-cols-2">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-orange-500 to-pink-500" />
            Get started
          </div>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
            Create your Brilliem account
          </h1>
          <p className="mt-3 text-slate-600">
            Choose a plan, tell us a bit about you, and jump straight into your dashboard.
          </p>

          {canceled && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Payment was canceled. You can choose a plan and try again anytime.
            </div>
          )}

          {mode === "signup" && (
            <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <SignUp
                routing="hash"
                appearance={{ elements: { card: "shadow-none border-none p-0" } }}
              />
              <div className="mt-4 text-xs text-slate-500">
                After you sign up, you’ll choose your plan and finish setup.
              </div>
            </div>
          )}

          {mode === "onboarding" && (
            <div className="mt-6 grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="First name" value={firstName} onChange={setFirstName} />
                <Field label="Last name" value={lastName} onChange={setLastName} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="City/Town (optional)" value={city} onChange={setCity} />
                <Field label="Province (optional)" value={province} onChange={setProvince} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Country (optional)" value={country} onChange={setCountry} />
                <Field
                  label="Grade level (optional)"
                  value={gradeLevel}
                  onChange={setGradeLevel}
                  placeholder="e.g., Grade 7"
                />
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Choose your plan</div>
            <div className="mt-1 text-sm text-slate-600">
              Upgrade or change anytime in Profile.
            </div>

            <div className="mt-5 grid gap-4">
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTier(t.id)}
                  className={`relative overflow-hidden rounded-2xl border p-5 text-left shadow-sm transition ${
                    tier === t.id ? "border-slate-900" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div
                    className={`pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-gradient-to-br ${t.accent} opacity-15 blur-2xl`}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-slate-900">{t.name}</div>
                      <div className="mt-1 text-sm text-slate-600">{t.price}</div>
                    </div>
                    <div
                      className={`h-9 w-9 rounded-xl bg-gradient-to-br ${t.accent} opacity-90`}
                      aria-hidden="true"
                    />
                  </div>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {t.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>

            {paid && (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">Payment method</div>
                <div className="mt-1 text-sm text-slate-600">
                  You’ll enter your payment details securely on Stripe after you continue.
                </div>
              </div>
            )}

            <button
              disabled={mode !== "onboarding" || loading}
              onClick={onSubmit}
              className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? "Continuing..." : paid ? "Continue to payment" : "Create account & go to dashboard"}
            </button>

            {mode !== "onboarding" && (
              <div className="mt-3 text-xs text-slate-500">
                Finish signup above first, then return here to pick a plan.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
