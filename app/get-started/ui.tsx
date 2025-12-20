"use client";

import { useEffect, useState } from "react";
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-white/80">{label}</div>
      <input
        className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/40 outline-none focus:border-white/20"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        autoComplete={
          type === "email"
            ? "email"
            : type === "password"
              ? "new-password"
              : "on"
        }
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
      setInfo("We sent a verification code to your email.");
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

      // Optional: initialize metadata (tier defaults to free, clears any leftover requestedTier)
      // Don't block the redirect if this fails.
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

  const disabled = busy;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-white">Get started</h1>
      <p className="mt-2 text-white/70">Create your account.</p>

      {error && (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {info && (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
          {info}
        </div>
      )}

      {/* STEP: SIGNUP */}
      {step === "signup" && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="First name" value={firstName} onChange={setFirstName} placeholder="Jason" />
            <Field label="Last name" value={lastName} onChange={setLastName} placeholder="Huang" />
            <div className="md:col-span-2">
              <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
            </div>
            <div className="md:col-span-2">
              <Field label="Password" value={password} onChange={setPassword} placeholder="••••••••" type="password" />
            </div>
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={startSignup}
            className={cx(
              "mt-5 w-full rounded-xl px-4 py-2 text-sm font-semibold",
              disabled ? "bg-white/5 text-white/30" : "bg-white text-black hover:bg-white/90"
            )}
          >
            {busy ? "Creating account…" : "Create account"}
          </button>
        </div>
      )}

      {/* STEP: VERIFY */}
      {step === "verify" && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm font-semibold text-white">Verify your email</div>
          <div className="mt-1 text-sm text-white/70">Enter the code we emailed you.</div>

          <div className="mt-4">
            <Field label="Verification code" value={verifyCode} onChange={setVerifyCode} placeholder="123456" />
          </div>

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setStep("signup")}
              className={cx(
                "rounded-xl px-4 py-2 text-sm font-semibold",
                disabled ? "bg-white/5 text-white/30" : "bg-white/10 text-white/80 hover:bg-white/15"
              )}
            >
              Back
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={verifyEmailCode}
              className={cx(
                "flex-1 rounded-xl px-4 py-2 text-sm font-semibold",
                disabled ? "bg-white/5 text-white/30" : "bg-white text-black hover:bg-white/90"
              )}
            >
              {busy ? "Verifying…" : "Verify email"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
