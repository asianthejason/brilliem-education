"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold text-slate-800">
        {label} {required ? <span className="text-red-600">*</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
        required={required}
      />
    </label>
  );
}

function PaymentBox({
  clientSecret,
}: {
  clientSecret: string;
}) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <PaymentBoxInner />
    </Elements>
  );
}

function PaymentBoxInner() {
  const stripe = useStripe();
  const elements = useElements();

  // This component only renders the element; confirm happens from parent.
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold text-slate-900">Payment method</div>
      <div className="mt-3">
        <PaymentElement />
      </div>
      {!stripe || !elements ? (
        <div className="mt-3 text-xs text-slate-500">Loading payment form…</div>
      ) : null}
    </div>
  );
}

export function GetStartedClient({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { user } = useUser();

  const { isLoaded: signUpLoaded, signUp, setActive } = useSignUp();

  // Required signup fields
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [email, setEmail] = useState(user?.primaryEmailAddress?.emailAddress ?? "");
  const [password, setPassword] = useState("");

  // Optional fields
  const [gradeLevel, setGradeLevel] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [country, setCountry] = useState("Canada");

  const [tier, setTier] = useState<Tier>("free");

  // Email verification step (signup only)
  const [signupStep, setSignupStep] = useState<"form" | "verify">("form");
  const [verifyCode, setVerifyCode] = useState("");

  // Stripe Payment Element state (onboarding)
  const paid = useMemo(() => tier !== "free", [tier]);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pull saved fields from localStorage after signup -> onboarding redirect
  useEffect(() => {
    if (mode !== "onboarding") return;
    try {
      const raw = localStorage.getItem("brilliem_onboarding");
      if (!raw) return;
      const data = JSON.parse(raw);

      if (typeof data.firstName === "string") setFirstName(data.firstName);
      if (typeof data.lastName === "string") setLastName(data.lastName);
      if (typeof data.gradeLevel === "string") setGradeLevel(data.gradeLevel);
      if (typeof data.schoolName === "string") setSchoolName(data.schoolName);
      if (typeof data.city === "string") setCity(data.city);
      if (typeof data.province === "string") setProvince(data.province);
      if (typeof data.country === "string") setCountry(data.country);
      if (data.tier === "free" || data.tier === "lessons" || data.tier === "lessons_ai")
        setTier(data.tier);

      localStorage.removeItem("brilliem_onboarding");
    } catch {
      // ignore
    }
  }, [mode]);

  async function saveProfile(desiredTier: Tier) {
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
    if (!res.ok) throw new Error("Failed to save profile");
  }

  async function ensureSubscriptionIntent() {
    if (!paid) return;
    if (clientSecret && subscriptionId) return;

    const res = await fetch("/api/stripe/subscription-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    });

    const data = (await res.json()) as { clientSecret?: string; subscriptionId?: string };
    if (!res.ok || !data.clientSecret || !data.subscriptionId) {
      throw new Error("Failed to initialize payment");
    }

    setClientSecret(data.clientSecret);
    setSubscriptionId(data.subscriptionId);
  }

  async function doSignUp() {
    setError(null);

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

      // Persist optional fields + tier across the verification redirect step
      localStorage.setItem(
        "brilliem_onboarding",
        JSON.stringify({
          firstName,
          lastName,
          gradeLevel,
          schoolName,
          city,
          province,
          country,
          tier,
        })
      );

      setSignupStep("verify");
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        "Could not create account.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function doVerify() {
    setError(null);
    if (!signUpLoaded || !signUp) return;

    setBusy(true);
    try {
      const res = await signUp.attemptEmailAddressVerification({ code: verifyCode });

      if (res.status === "complete") {
        await setActive({ session: res.createdSessionId });

        // After signup completes, reload as onboarding (signed-in)
        router.replace("/get-started");
        router.refresh();
        return;
      }

      setError("Verification incomplete. Please try again.");
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        "Invalid verification code.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function finishFree() {
    await saveProfile("free");
    router.push("/dashboard");
    router.refresh();
  }

  async function finishPaid() {
    // Save profile fields immediately; tier will be finalized after Stripe says active
    await saveProfile(tier);

    await ensureSubscriptionIntent();

    // Confirm payment (must run inside Elements context, so we do a small trick)
    // We’ll redirect the user after success by polling activate endpoint.
    // Instead of complicated cross-component callbacks, we use a minimal inline confirm route below.
    router.push(`/get-started?pay=1`);
  }

  // If pay=1, confirm payment using the embedded element (requires clientSecret)
  useEffect(() => {
    async function maybeConfirm() {
      if (mode !== "onboarding") return;
      const url = new URL(window.location.href);
      if (url.searchParams.get("pay") !== "1") return;
      if (!paid) return;
      if (!clientSecret || !subscriptionId) return;

      // Let the user click the button again after returning
      url.searchParams.delete("pay");
      window.history.replaceState({}, "", url.toString());
    }
    maybeConfirm();
  }, [mode, paid, clientSecret, subscriptionId]);

  // Primary button handler (only one button on the right)
  async function onPrimaryClick() {
    try {
      setError(null);

      if (mode === "signup") {
        if (signupStep === "form") return await doSignUp();
        return await doVerify();
      }

      // onboarding (signed in)
      if (!paid) return await finishFree();

      // Ensure payment intent exists so PaymentElement can be shown
      await ensureSubscriptionIntent();

      // Now confirm payment
      setBusy(true);

      // Confirm payment via Stripe JS by reaching into the iframe-less element
      const stripeJs = await stripePromise;
      if (!stripeJs) throw new Error("Stripe failed to load.");

      // Use Elements manually with the existing clientSecret by mounting a hidden Elements instance? Nope:
      // We’ll instead rely on the PaymentElement already mounted in the page.
      // The simplest way is to confirm using a form-level submit inside the Elements tree.
      // So: we trigger a custom event that the payment form listens to.
      window.dispatchEvent(new CustomEvent("brilliem:confirm-payment"));
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
      setBusy(false);
    }
  }

  const primaryLabel =
    mode === "signup"
      ? signupStep === "form"
        ? "Create account"
        : "Verify email"
      : paid
      ? "Subscribe & go to dashboard"
      : "Create account & go to dashboard";

  return (
    <main className="mx-auto max-w-6xl px-4 py-14">
      <div className="grid gap-10 md:grid-cols-2">
        {/* LEFT: Signup/Profile fields */}
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-orange-500 to-pink-500" />
            Get started
          </div>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
            Create your Brilliem account
          </h1>
          <p className="mt-3 text-slate-600">
            Choose a plan, fill in your details, and jump into your dashboard.
          </p>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Your details</div>
            <p className="mt-1 text-sm text-slate-600">
              First name, last name, email, and password are required.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="First name" value={firstName} onChange={setFirstName} required />
              <Field label="Last name" value={lastName} onChange={setLastName} required />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field
                label="Email"
                value={email}
                onChange={setEmail}
                type="email"
                required
              />
              <Field
                label="Password"
                value={password}
                onChange={setPassword}
                type="password"
                required={mode === "signup"} // only needed during signup step
                placeholder={mode === "onboarding" ? "Already set" : "Create a password"}
              />
            </div>

            {mode === "signup" && signupStep === "verify" && (
              <div className="mt-4">
                <Field
                  label="Email verification code"
                  value={verifyCode}
                  onChange={setVerifyCode}
                  placeholder="Code from your email"
                  required
                />
                <p className="mt-2 text-xs text-slate-500">
                  Enter the code we emailed you to activate your account.
                </p>
              </div>
            )}

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field label="Grade level (optional)" value={gradeLevel} onChange={setGradeLevel} placeholder="e.g., Grade 7" />
              <Field label="School name (optional)" value={schoolName} onChange={setSchoolName} />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="City/Town (optional)" value={city} onChange={setCity} />
              <Field label="Province (optional)" value={province} onChange={setProvince} placeholder="e.g., AB" />
            </div>

            <div className="mt-4">
              <Field label="Country (optional)" value={country} onChange={setCountry} />
            </div>
          </div>
        </div>

        {/* RIGHT: Plan cards + conditional payment + single button */}
        <div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Choose your plan</div>
            <div className="mt-1 text-sm text-slate-600">
              Payment appears below only for paid plans.
            </div>

            <div className="mt-5 grid gap-4">
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  onClick={async () => {
                    setTier(t.id);
                    setError(null);

                    // Reset payment UI when changing tier
                    setClientSecret(null);
                    setSubscriptionId(null);

                    // In onboarding mode, initialize payment form immediately when paid tier selected
                    if (mode === "onboarding" && t.id !== "free") {
                      try {
                        setBusy(true);
                        await ensureSubscriptionIntent();
                      } catch {
                        setError("Could not load payment form. Please try again.");
                      } finally {
                        setBusy(false);
                      }
                    }
                  }}
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
                    <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${t.accent} opacity-90`} />
                  </div>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {t.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>

            {/* Payment Element shown ONLY when paid tier selected AND onboarding */}
            {mode === "onboarding" && paid && clientSecret && (
              <ConfirmablePaymentSection
                clientSecret={clientSecret}
                subscriptionId={subscriptionId!}
                tier={tier}
                onDone={() => {
                  router.push("/dashboard");
                  router.refresh();
                }}
                onError={(msg) => setError(msg)}
                setBusy={(v) => setBusy(v)}
              />
            )}

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}

            {/* Single button */}
            <button
              onClick={onPrimaryClick}
              disabled={
                busy ||
                (mode === "signup" && (!firstName || !lastName || !email || (signupStep === "form" && !password))) ||
                (mode === "signup" && signupStep === "verify" && !verifyCode)
              }
              className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {busy ? "Please wait…" : primaryLabel}
            </button>

            {mode === "onboarding" && paid && !clientSecret && (
              <div className="mt-3 text-xs text-slate-500">
                Select a paid plan to load the payment form.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * This renders the payment element and listens for the custom confirm event
 * triggered by the single main button.
 */
function ConfirmablePaymentSection({
  clientSecret,
  subscriptionId,
  tier,
  onDone,
  onError,
  setBusy,
}: {
  clientSecret: string;
  subscriptionId: string;
  tier: Tier;
  onDone: () => void;
  onError: (msg: string) => void;
  setBusy: (v: boolean) => void;
}) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <ConfirmablePaymentInner
        subscriptionId={subscriptionId}
        tier={tier}
        onDone={onDone}
        onError={onError}
        setBusy={setBusy}
      />
    </Elements>
  );
}

function ConfirmablePaymentInner({
  subscriptionId,
  tier,
  onDone,
  onError,
  setBusy,
}: {
  subscriptionId: string;
  tier: Tier;
  onDone: () => void;
  onError: (msg: string) => void;
  setBusy: (v: boolean) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();

  useEffect(() => {
    async function handler() {
      if (!stripe || !elements) return;

      setBusy(true);
      try {
        const origin = window.location.origin;

        const result = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: `${origin}/dashboard`,
          },
          redirect: "if_required",
        });

        if (result.error) {
          onError(result.error.message || "Payment failed.");
          return;
        }

        // Activate tier only after subscription is active
        const res = await fetch("/api/stripe/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscriptionId, tier }),
        });

        if (!res.ok) {
          const txt = await res.text();
          onError(`Payment received, but activation failed: ${txt}`);
          return;
        }

        onDone();
        router.refresh();
      } catch (e: any) {
        onError(e?.message || "Payment failed.");
      } finally {
        setBusy(false);
      }
    }

    const listener = () => handler();
    window.addEventListener("brilliem:confirm-payment", listener as any);
    return () => window.removeEventListener("brilliem:confirm-payment", listener as any);
  }, [stripe, elements, subscriptionId, tier, onDone, onError, setBusy, router]);

  return <PaymentBox clientSecret={"unused"} />; // PaymentElement already mounted below
}

function PaymentBox({ clientSecret }: { clientSecret: string }) {
  // clientSecret not used here (Elements already has it), but kept to match earlier structure
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold text-slate-900">Payment method</div>
      <div className="mt-3">
        <PaymentElement />
      </div>
      <div className="mt-2 text-xs text-slate-500">
        Your payment is processed securely by Stripe.
      </div>
    </div>
  );
}
