"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSignUp, useUser } from "@clerk/nextjs";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

type Mode = "signup" | "onboarding";
type Tier = "free" | "lessons" | "lessons_ai";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

const TIERS: Array<{
  id: Tier;
  name: string;
  price: string;
  bullets: string[];
}> = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    bullets: ["Browse content", "Basic tools"],
  },
  {
    id: "lessons",
    name: "Lessons",
    price: "$?/mo",
    bullets: ["Book lessons", "Premium content"],
  },
  {
    id: "lessons_ai",
    name: "Lessons + AI Tutor",
    price: "$?/mo",
    bullets: ["Everything in Lessons", "AI tutor"],
  },
];

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm text-white/80">{label}</div>
      <input
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/30 outline-none focus:border-white/25"
        value={value}
        type={type}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function TierCard({
  tier,
  selected,
  onSelect,
  disabled,
}: {
  tier: (typeof TIERS)[number];
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={[
        "w-full rounded-2xl border p-4 text-left transition",
        selected ? "border-white/40 bg-white/10" : "border-white/10 bg-white/5 hover:border-white/25",
        disabled ? "opacity-60 cursor-not-allowed" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-white">{tier.name}</div>
          <div className="mt-0.5 text-sm text-white/70">{tier.price}</div>
        </div>
        <div
          className={[
            "mt-1 h-4 w-4 rounded-full border",
            selected ? "border-white bg-white" : "border-white/40",
          ].join(" ")}
        />
      </div>
      <ul className="mt-3 space-y-1 text-sm text-white/75">
        {tier.bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-white/60" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}

export function GetStartedClient({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();

  const { user, isLoaded: userLoaded } = useUser();
  const { isLoaded: signUpLoaded, signUp, setActive } = useSignUp();

  const [tier, setTier] = useState<Tier>("free");

  // Profile fields (saved to Clerk unsafeMetadata via /api/onboarding)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [country, setCountry] = useState("Canada");

  const [step, setStep] = useState<"signup" | "verify" | "onboarding" | "payment">(
    mode === "signup" ? "signup" : "onboarding"
  );
  const [verifyCode, setVerifyCode] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Stripe Payment Element state
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);
  const [paymentSubscriptionId, setPaymentSubscriptionId] = useState<string | null>(null);

  const isSignedIn = !!user?.id;
  const userTier = (user?.unsafeMetadata?.tier as Tier | undefined) ?? "free";
  const requestedTier = (user?.unsafeMetadata?.requestedTier as Tier | undefined) ?? null;

  const paidSelected = useMemo(() => tier !== "free", [tier]);

  // Prefill from Clerk when signed in
  useEffect(() => {
    if (!userLoaded || !user) return;

    setFirstName((v) => v || user.firstName || "");
    setLastName((v) => v || user.lastName || "");
    const primaryEmail = user.emailAddresses?.[0]?.emailAddress || "";
    setEmail((v) => v || primaryEmail);

    const md = (user.unsafeMetadata ?? {}) as any;
    if (typeof md.gradeLevel === "string") setGradeLevel(md.gradeLevel);
    if (typeof md.schoolName === "string") setSchoolName(md.schoolName);
    if (typeof md.city === "string") setCity(md.city);
    if (typeof md.province === "string") setProvince(md.province);
    if (typeof md.country === "string" && md.country) setCountry(md.country);

    // If user already picked a requested tier, keep it selected in the UI
    if (md.requestedTier === "lessons" || md.requestedTier === "lessons_ai") setTier(md.requestedTier);
    else if (md.tier === "lessons" || md.tier === "lessons_ai" || md.tier === "free") setTier(md.tier);
  }, [userLoaded, user]);

  // Handle return from 3DS (if the bank requires a redirect) and finalize tier.
  useEffect(() => {
    if (!isSignedIn) return;

    const payment = params.get("payment");
    const subscriptionId = params.get("subscription_id");
    const tierParam = params.get("tier") as Tier | null;

    if (payment === "complete" && subscriptionId && (tierParam === "lessons" || tierParam === "lessons_ai")) {
      setBusy(true);
      setError(null);
      setInfo("Finalizing your subscription…");
      (async () => {
        try {
          const res = await fetch("/api/stripe/activate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscriptionId, tier: tierParam }),
          });
          if (!res.ok) throw new Error(await res.text());

          setInfo("Payment confirmed! Your subscription is active.");
          setStep("onboarding");
          router.replace("/get-started");
          router.refresh();
        } catch (e: any) {
          setError(e?.message || "Could not finalize payment.");
        } finally {
          setBusy(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  async function saveOnboarding(desiredTier: Tier) {
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        tier: desiredTier,
        gradeLevel,
        schoolName,
        city,
        province,
        country,
      }),
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }
  }

  async function beginOnPagePayment(desiredTier: Exclude<Tier, "free">) {
    setError(null);
    setInfo("Preparing payment…");
    setPaymentClientSecret(null);
    setPaymentSubscriptionId(null);

    const res = await fetch("/api/stripe/subscription-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: desiredTier }),
    });

    const data = (await res.json().catch(() => null)) as
      | { clientSecret?: string; subscriptionId?: string }
      | null;

    if (!res.ok || !data?.clientSecret || !data?.subscriptionId) {
      const txt = (await res.text().catch(() => "")) || "Could not start payment.";
      throw new Error(txt);
    }

    setPaymentClientSecret(data.clientSecret);
    setPaymentSubscriptionId(data.subscriptionId);
    setStep("payment");
    setInfo(null);
  }

  async function doSignUp() {
    setError(null);
    setInfo(null);

    if (!signUpLoaded || !signUp) return;

    if (!firstName || !lastName || !email || !password) {
      setError("Please fill in First name, Last name, Email, and Password.");
      return;
    }

    setBusy(true);
    try {
      await signUp.create({
        firstName,
        lastName,
        emailAddress: email,
        password,
      });

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("verify");
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        "Could not create account.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function doVerify() {
    setError(null);
    setInfo(null);

    if (!signUpLoaded || !signUp) return;

    if (!verifyCode) {
      setError("Please enter the verification code.");
      return;
    }

    setBusy(true);
    try {
      const res = await signUp.attemptEmailAddressVerification({ code: verifyCode });

      if (res.status !== "complete") {
        setError("Verification incomplete. Please try again.");
        return;
      }

      await setActive({ session: res.createdSessionId });

      // At this point the user is signed in, so we can save onboarding info
      // and either finish (free) or start on-page payment (paid).
      if (tier === "free") {
        await saveOnboarding("free");
        setInfo("Account created! You're on the Free plan.");
        setStep("onboarding");
        router.refresh();
      } else {
        // Save profile + requestedTier (tier stays free until payment confirmed)
        await saveOnboarding(tier);
        await beginOnPagePayment(tier);
      }
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        "Invalid verification code.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function doOnboardingContinue() {
    setError(null);
    setInfo(null);
    if (!isSignedIn) return;

    setBusy(true);
    try {
      if (tier === "free") {
        await saveOnboarding("free");
        setInfo("Saved! You're on the Free plan.");
        router.refresh();
        return;
      }

      // Paid: save requestedTier (tier remains free until Stripe confirmation) then on-page payment.
      await saveOnboarding(tier);
      await beginOnPagePayment(tier);
    } catch (e: any) {
      setError(e?.message || "Could not continue.");
    } finally {
      setBusy(false);
    }
  }

  const title =
    step === "verify"
      ? "Verify your email"
      : step === "payment"
        ? "Complete payment"
      : isSignedIn
        ? "Finish setup"
        : "Get started";

  const primaryLabel =
    step === "verify"
      ? "Verify"
      : step === "payment"
        ? ""
      : isSignedIn
        ? tier === "free"
          ? "Save"
          : "Continue to payment"
        : "Create account";

  const primaryDisabled =
    busy ||
    (step === "verify" ? !verifyCode : !firstName || !lastName) ||
    (!isSignedIn && step !== "verify" && (!email || !password));

  return (
    <div className="min-h-[calc(100vh-64px)] bg-black">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">{title}</h1>
          <p className="mt-2 text-white/70">
            {isSignedIn
              ? userTier !== "free"
                ? "Your subscription is active. You can update your profile info anytime."
                : requestedTier
                  ? "You selected a paid plan, but payment isn't confirmed yet. Continue to payment to activate it."
                  : "Select a plan and save your profile details."
              : "Create an account, verify your email, then complete payment if you chose a paid plan."}
          </p>
        </div>

        {(error || info) && (
          <div
            className={[
              "mb-6 rounded-2xl border px-4 py-3 text-sm",
              error ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-white/10 bg-white/5 text-white/80",
            ].join(" ")}
          >
            {error || info}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="mb-4 text-sm font-semibold text-white/80">Plan</div>
              <div className="grid gap-3">
                {TIERS.map((t) => (
                  <TierCard
                    key={t.id}
                    tier={t}
                    selected={tier === t.id}
                    onSelect={() => setTier(t.id)}
                    disabled={userTier !== "free" && t.id !== userTier}
                  />
                ))}
              </div>
              {userTier !== "free" && (
                <div className="mt-3 text-xs text-white/60">
                  You already have an active paid plan ({userTier}). Plan switching can be added later in a billing page.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="mb-4 text-sm font-semibold text-white/80">
                {isSignedIn ? "Your details" : "Create your account"}
              </div>

              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="First name" value={firstName} onChange={setFirstName} required />
                  <Field label="Last name" value={lastName} onChange={setLastName} required />
                </div>

                {!isSignedIn && step !== "verify" && (
                  <>
                    <Field label="Email" value={email} onChange={setEmail} type="email" required />
                    <Field label="Password" value={password} onChange={setPassword} type="password" required />
                  </>
                )}

                {isSignedIn && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Grade" value={gradeLevel} onChange={setGradeLevel} placeholder="e.g., 10" />
                    <Field label="School" value={schoolName} onChange={setSchoolName} placeholder="Optional" />
                  </div>
                )}

                {isSignedIn && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="City" value={city} onChange={setCity} placeholder="Optional" />
                    <Field label="Province" value={province} onChange={setProvince} placeholder="Optional" />
                    <Field label="Country" value={country} onChange={setCountry} placeholder="Canada" />
                  </div>
                )}
              </div>

              <div className="mt-5 flex items-center gap-3">
                {step !== "payment" && (
                  <button
                    type="button"
                    disabled={primaryDisabled}
                    onClick={step === "verify" ? doVerify : isSignedIn ? doOnboardingContinue : doSignUp}
                    className={[
                      "rounded-xl px-4 py-2 text-sm font-semibold",
                      primaryDisabled ? "bg-white/10 text-white/40" : "bg-white text-black hover:bg-white/90",
                    ].join(" ")}
                  >
                    {busy ? "Please wait…" : primaryLabel}
                  </button>
                )}

                {step === "verify" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setStep("signup")}
                    className={[
                      "rounded-xl px-4 py-2 text-sm font-semibold",
                      busy ? "bg-white/5 text-white/30" : "bg-white/10 text-white/80 hover:bg-white/15",
                    ].join(" ")}
                  >
                    Back
                  </button>
                )}
              </div>
            </div>

            {step === "verify" && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="mb-2 text-sm font-semibold text-white/80">Verification code</div>
                <p className="mb-3 text-sm text-white/70">
                  We sent a code to {email || "your email"}. Enter it below to verify your account.
                </p>
                <Field
                  label="Code"
                  value={verifyCode}
                  onChange={setVerifyCode}
                  placeholder="123456"
                  required
                />
              </div>
            )}

            {step === "payment" && paymentClientSecret && paymentSubscriptionId && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="mb-2 text-sm font-semibold text-white/80">Payment</div>
                <p className="mb-4 text-sm text-white/70">
                  Enter your payment details below. You won’t be redirected to a separate Stripe payment page.
                </p>

                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret: paymentClientSecret,
                    appearance: { theme: "night" },
                  }}
                >
                  <OnPagePaymentForm
                    tier={tier as Exclude<Tier, "free">}
                    subscriptionId={paymentSubscriptionId}
                    onBack={() => setStep(isSignedIn ? "onboarding" : "signup")}
                    onActivated={() => {
                      setStep("onboarding");
                      router.refresh();
                    }}
                    setBusy={setBusy}
                    setError={setError}
                    setInfo={setInfo}
                  />
                </Elements>
              </div>
            )}

            {isSignedIn && userTier === "free" && requestedTier && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm font-semibold text-white/80">Payment pending</div>
                <p className="mt-2 text-sm text-white/70">
                  You selected <span className="text-white">{requestedTier}</span>. Click
                  <span className="text-white"> Continue to payment</span> to activate it.
                </p>
                <div className="mt-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        setBusy(true);
                        setTier(requestedTier);
                        await beginOnPagePayment(requestedTier);
                      } catch (e: any) {
                        setError(e?.message || "Could not start payment.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className={[
                      "rounded-xl px-4 py-2 text-sm font-semibold",
                      busy ? "bg-white/10 text-white/40" : "bg-white text-black hover:bg-white/90",
                    ].join(" ")}
                  >
                    {busy ? "Please wait…" : "Continue to payment"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-10 text-xs text-white/40">
          Troubleshooting tip: Make sure your Stripe keys and price IDs are from the same mode (Test vs Live).
        </div>
      </div>
    </div>
  );
}

function OnPagePaymentForm({
  tier,
  subscriptionId,
  onBack,
  onActivated,
  setBusy,
  setError,
  setInfo,
}: {
  tier: Exclude<Tier, "free">;
  subscriptionId: string;
  onBack: () => void;
  onActivated: () => void;
  setBusy: (v: boolean) => void;
  setError: (v: string | null) => void;
  setInfo: (v: string | null) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function activateNow() {
    const res = await fetch("/api/stripe/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId, tier }),
    });
    if (!res.ok) throw new Error(await res.text());
  }

  async function onSubmit() {
    setError(null);
    setInfo(null);

    if (!stripe || !elements) {
      setError("Stripe is still loading. Please try again in a moment.");
      return;
    }

    setSubmitting(true);
    setBusy(true);
    try {
      const returnUrl = `${window.location.origin}/get-started?payment=complete&subscription_id=${encodeURIComponent(
        subscriptionId
      )}&tier=${encodeURIComponent(tier)}`;

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });

      if (error) {
        setError(error.message || "Payment failed.");
        return;
      }

      // If Stripe didn't redirect, we can usually finalize immediately.
      if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
        await activateNow();
        setInfo("Payment confirmed! Your subscription is active.");
        onActivated();
        return;
      }

      // If the bank required a redirect, the user will return via return_url
      // and the effect in GetStartedClient will finalize activation.
      setInfo("Payment submitted. If your bank needs extra verification, you'll return here to finish.");
    } catch (e: any) {
      setError(e?.message || "Payment failed.");
    } finally {
      setSubmitting(false);
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <PaymentElement />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={submitting}
          onClick={onSubmit}
          className={[
            "rounded-xl px-4 py-2 text-sm font-semibold",
            submitting ? "bg-white/10 text-white/40" : "bg-white text-black hover:bg-white/90",
          ].join(" ")}
        >
          {submitting ? "Processing…" : "Subscribe"}
        </button>

        <button
          type="button"
          disabled={submitting}
          onClick={onBack}
          className={[
            "rounded-xl px-4 py-2 text-sm font-semibold",
            submitting ? "bg-white/5 text-white/30" : "bg-white/10 text-white/80 hover:bg-white/15",
          ].join(" ")}
        >
          Back
        </button>
      </div>

      <div className="mt-3 text-xs text-white/50">
        Note: some banks require an extra verification step (3D Secure). If so, you'll be brought right back to this page.
      </div>
    </div>
  );
}
