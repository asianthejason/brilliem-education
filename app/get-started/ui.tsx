"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSignUp, useUser } from "@clerk/nextjs";

type Step = "signup" | "verify";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-slate-700">{label}</div>
      <input
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        autoComplete={autoComplete}
      />
    </label>
  );
}

export function GetStartedClient() {
  const router = useRouter();
  const { user } = useUser();
  const { isLoaded: signUpLoaded, signUp, setActive } = useSignUp();

  const [step, setStep] = useState<Step>("signup");

  // Signup fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // Verify
  const [verifyCode, setVerifyCode] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (step === "signup") {
      return !!firstName.trim() && !!lastName.trim() && !!email.trim() && !!password;
    }
    return !!verifyCode.trim();
  }, [step, firstName, lastName, email, password, verifyCode]);

  // If the user is already signed in, send them to the dashboard
  useEffect(() => {
    if (user?.id) router.replace("/dashboard");
  }, [user?.id, router]);

  async function startSignup() {
    if (!signUpLoaded || !signUp) return;

    setError(null);
    setInfo(null);

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setError("Please fill in your first name, last name, email, and password.");
      return;
    }

    setBusy(true);
    try {
      const created = await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });

      await created.prepareEmailAddressVerification({ strategy: "email_code" });

      setStep("verify");
      setInfo("We sent a 6‑digit code to your email. Enter it below to finish creating your account.");
    } catch (e: any) {
      setError(e?.errors?.[0]?.message || e?.message || "Failed to create account");
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmailCode() {
    if (!signUpLoaded || !signUp || !setActive) return;

    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      const complete = await signUp.attemptEmailAddressVerification({ code: verifyCode.trim() });
      if (complete.status !== "complete") {
        throw new Error("Verification not complete. Please try again.");
      }

      // Create the session (sign the user in)
      await setActive({ session: complete.createdSessionId });

      // Optional: initialize metadata (don't block redirect)
      fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }),
      }).catch(() => {});

      router.replace("/dashboard");
    } catch (e: any) {
      setError(e?.errors?.[0]?.message || e?.message || "Invalid verification code");
    } finally {
      setBusy(false);
    }
  }

  const submit = async () => {
    if (busy) return;
    if (step === "signup") return startSignup();
    return verifyEmailCode();
  };

  return (
    <div className="min-h-[70vh] bg-white">
      {/* bright hero */}
      <div className="relative overflow-hidden border-b border-slate-200">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-50 via-fuchsia-50 to-emerald-50" />
        <div className="relative mx-auto max-w-5xl px-4 py-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Brilliem Education
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
            Get started
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Create your account in under a minute. You’ll verify your email, then you’ll be sent to your dashboard.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mx-auto max-w-xl">
          {/* status */}
          {error && (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <div className="font-semibold">Something went wrong</div>
              <div className="mt-1">{error}</div>
            </div>
          )}
          {info && (
            <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              <div className="font-semibold">Check your email</div>
              <div className="mt-1">{info}</div>
            </div>
          )}

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {step === "signup" ? "Create account" : "Verify your email"}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {step === "signup"
                    ? "Use your name, email, and a password."
                    : "Enter the code we emailed you."}
                </div>
              </div>

              <div className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 md:inline-flex">
                Step {step === "signup" ? "1" : "2"} of 2
              </div>
            </div>

            {step === "signup" ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Field
                  label="First name"
                  value={firstName}
                  onChange={setFirstName}
                  placeholder="Jason"
                  autoComplete="given-name"
                />
                <Field
                  label="Last name"
                  value={lastName}
                  onChange={setLastName}
                  placeholder="Huang"
                  autoComplete="family-name"
                />
                <div className="md:col-span-2">
                  <Field
                    label="Email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@example.com"
                    type="email"
                    autoComplete="email"
                  />
                </div>
                <div className="md:col-span-2">
                  <Field
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                    type="password"
                    autoComplete="new-password"
                  />
                  <div className="mt-2 text-xs text-slate-500">
                    Use at least 8 characters. You can change it later in your account settings.
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6">
                <Field
                  label="Verification code"
                  value={verifyCode}
                  onChange={setVerifyCode}
                  placeholder="123456"
                  autoComplete="one-time-code"
                />

                <button
                  type="button"
                  className="mt-3 text-xs font-semibold text-slate-600 hover:text-slate-900"
                  onClick={() => {
                    setError(null);
                    setInfo(null);
                    setStep("signup");
                  }}
                  disabled={busy}
                >
                  ← Back to signup
                </button>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                disabled={busy || !canSubmit}
                onClick={submit}
                className={cx(
                  "w-full rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm transition",
                  busy || !canSubmit
                    ? "bg-slate-200 text-slate-500"
                    : "bg-gradient-to-r from-blue-600 to-fuchsia-600 text-white hover:brightness-110"
                )}
              >
                {step === "signup"
                  ? busy
                    ? "Creating account…"
                    : "Create account"
                  : busy
                    ? "Verifying…"
                    : "Verify & continue"}
              </button>

              {step === "verify" && (
                <div className="text-center text-xs text-slate-500">
                  Didn’t receive a code? Check your spam folder or try again in a minute.
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-slate-500">
            By continuing, you agree to our Terms and Privacy Policy.
          </div>
        </div>
      </div>
    </div>
  );
}
