"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSignUp, useUser } from "@clerk/nextjs";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";

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
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
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
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50"
        required={required}
        disabled={disabled}
      />
    </label>
  );
}

const FINALIZE_FLAG = "brilliem_finalize_after_verify";

export function GetStartedClient({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { user } = useUser();
  const { isLoaded: signUpLoaded, signUp, setActive } = useSignUp();

  // Required fields
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

  // Signup verify step
  const [signupStep, setSignupStep] = useState<"form" | "verify">("form");
  const [verifyCode, setVerifyCode] = useState("");

  const paid = useMemo(() => tier !== "free", [tier]);

  // Stripe: card element mounted for paid tiers (signup + onboarding)
  const cardMountRef = useRef<HTMLDivElement | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const cardRef = useRef<any>(null);
  const [cardReady, setCardReady] = useState(false);

  // Store payment method id across verify -> onboarding
  const [storedPaymentMethodId, setStoredPaymentMethodId] = useState<string | null>(null);

  // When switching to onboarding mode after verify, we need to wait for localStorage to hydrate tier + PM.
  const [hydrated, setHydrated] = useState(false);

  // Subscription intent state (created server-side after signup completes)
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ensureStripeLoaded() {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!pk) throw new Error("Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");

    if (stripeRef.current) return stripeRef.current;

    const stripe = await loadStripe(pk);
    if (!stripe) throw new Error("Stripe failed to load");
    stripeRef.current = stripe;
    return stripe;
  }

  async function ensureStripeAndCardMounted() {
    if (!paid) return;
    if (!cardMountRef.current) return;

    // Always ensure stripe is loaded
    const stripe = await ensureStripeLoaded();

    // Clean any previous (safe even if none)
    try {
      cardRef.current?.unmount?.();
    } catch {
      // ignore
    }
    cardRef.current = null;
    setCardReady(false);

    const elements = stripe.elements(); // Card Element doesn't require clientSecret
    elementsRef.current = elements;

    const card = elements.create("card", {
      style: {
        base: {
          fontSize: "16px",
        },
      },
    });

    card.mount(cardMountRef.current);
    cardRef.current = card;
    setCardReady(true);
  }

  async function createPaymentMethodId() {
    const stripe = await ensureStripeLoaded();
    const card = cardRef.current;

    if (!card) throw new Error("Payment field not ready yet.");

    const pm = await stripe.createPaymentMethod({
      type: "card",
      card,
      billing_details: {
        name: `${firstName} ${lastName}`.trim(),
        email,
      },
    });

    if (pm.error) throw new Error(pm.error.message || "Card error.");
    const id = pm.paymentMethod?.id;
    if (!id) throw new Error("Could not create payment method.");
    return id;
  }

  // Mount/unmount the credit card field whenever tier changes (both modes)
  useEffect(() => {
    setError(null);

    if (!paid) {
      try {
        cardRef.current?.unmount?.();
      } catch {
        // ignore
      }
      cardRef.current = null;
      setCardReady(false);
      return;
    }

    ensureStripeAndCardMounted().catch((e: any) =>
      setError(e?.message || "Could not load card field.")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, paid]);

  // Keep optional fields (+ tier + paymentMethodId) across verify -> onboarding
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
      if (typeof data.paymentMethodId === "string") setStoredPaymentMethodId(data.paymentMethodId);

      localStorage.removeItem("brilliem_onboarding");
    } catch {
      // ignore
    } finally {
      setHydrated(true);
    }
  }, [mode, hydrated, tier, storedPaymentMethodId]);

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
    if (!res.ok) throw new Error("Failed to save profile.");
  }

  async function ensureSubscriptionIntent(paymentMethodId: string) {
    if (!paid) return;

    // If we already have one for current flow, reuse it
    if (clientSecret && subscriptionId) return;

    const res = await fetch("/api/stripe/subscription-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier, paymentMethodId }),
    });

    const data = (await res.json()) as { clientSecret?: string; subscriptionId?: string; message?: string };

    if (!res.ok || !data.clientSecret || !data.subscriptionId) {
      throw new Error(data?.message || "Could not initialize subscription.");
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
      // If paid plan, require card details now and store PaymentMethod ID
      let paymentMethodId: string | null = null;
      if (paid) {
        if (!cardReady) throw new Error("Please wait for the card field to load.");
        paymentMethodId = await createPaymentMethodId();
        setStoredPaymentMethodId(paymentMethodId);
      }

      await signUp.create({
        firstName,
        lastName,
        emailAddress: email,
        password,
      });

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });

      // Store everything needed for the onboarding step after verification
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
          paymentMethodId,
        })
      );

      setSignupStep("verify");
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
    if (!signUpLoaded || !signUp) return;

    setBusy(true);
    try {
      const res = await signUp.attemptEmailAddressVerification({ code: verifyCode });

      if (res.status === "complete") {
        await setActive({ session: res.createdSessionId });

        // After we become signed-in, we want to auto-finalize the selected tier + payment (if any).
        // We do this on the next render in onboarding mode.
        sessionStorage.setItem(FINALIZE_FLAG, "1");

        // Hard navigate so the server definitely re-evaluates auth() and switches the page to onboarding mode.
        window.location.assign("/get-started?postVerify=1");
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

  async function confirmAndActivatePaidPlan() {
    if (!paid) return;

    const stripe = await ensureStripeLoaded();

    // Use stored payment method if we already created it during signup,
    // otherwise create it from the card field now.
    let pmId = storedPaymentMethodId;
    if (!pmId) {
      if (!cardReady) throw new Error("Please enter your card details.");
      pmId = await createPaymentMethodId();
      setStoredPaymentMethodId(pmId);
    }

    // Ensure server-side subscription exists (returns PaymentIntent client secret)
    await ensureSubscriptionIntent(pmId);

    if (!clientSecret || !subscriptionId) throw new Error("Missing payment info. Please try again.");

    // Pay the first invoice for the subscription
    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: pmId,
    });

    if (result.error) throw new Error(result.error.message || "Payment failed.");

    // After payment confirmation, activate tier in Clerk (your existing endpoint)
    const res = await fetch("/api/stripe/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId, tier }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Payment received, but activation failed: ${txt}`);
    }
  }

  // Auto-finalize immediately after email verification completes and we arrive in onboarding mode.
  useEffect(() => {
    if (mode !== "onboarding") return;

    const shouldFinalize = sessionStorage.getItem(FINALIZE_FLAG) === "1";
    if (!shouldFinalize) return;

    // Wait until we have hydrated tier/paymentMethodId from localStorage (set in signup step).
    if (!hydrated) return;

    // If they picked a paid tier during signup, we expect a stored PaymentMethod.
    if (tier !== "free" && !storedPaymentMethodId) {
      sessionStorage.removeItem(FINALIZE_FLAG);
      setError("We couldn't find your saved card details. Please re-enter your card and try again.");
      return;
    }

    sessionStorage.removeItem(FINALIZE_FLAG);

    (async () => {
      try {
        setError(null);
        setBusy(true);

        await saveProfile(tier);

        if (!paid) {
          router.push("/dashboard");
          router.refresh();
          return;
        }

        await confirmAndActivatePaidPlan();

        router.push("/dashboard");
        router.refresh();
      } catch (e: any) {
        setError(e?.message || "Payment failed. Please try again.");
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function onPrimaryClick() {
    setError(null);

    try {
      if (mode === "signup") {
        if (signupStep === "form") {
          await doSignUp();
          return;
        }
        await doVerify();
        return;
      }

      // onboarding (signed-in) manual submit
      setBusy(true);

      // Save profile fields first
      await saveProfile(tier);

      if (!paid) {
        router.push("/dashboard");
        router.refresh();
        return;
      }

      await confirmAndActivatePaidPlan();
      router.push("/dashboard");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const primaryDisabled =
    busy ||
    !firstName ||
    !lastName ||
    !email ||
    (mode === "signup" && signupStep === "form" && !password) ||
    (mode === "signup" && signupStep === "verify" && !verifyCode) ||
    (paid && !cardReady && !storedPaymentMethodId);

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
        {/* LEFT */}
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-orange-500 to-pink-500" />
            Get started
          </div>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
            Create your Brilliem account
          </h1>
          <p className="mt-3 text-slate-600">
            First name, last name, email, and password are required. The rest is optional.
          </p>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="First name" value={firstName} onChange={setFirstName} required />
              <Field label="Last name" value={lastName} onChange={setLastName} required />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Email" value={email} onChange={setEmail} type="email" required />
              <Field
                label="Password"
                value={password}
                onChange={setPassword}
                type="password"
                required={mode === "signup"}
                placeholder={mode === "onboarding" ? "Already set" : "Create a password"}
                disabled={mode === "onboarding"}
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
                <p className="mt-2 text-xs text-slate-500">Enter the code we emailed you.</p>
              </div>
            )}

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field
                label="Grade level (optional)"
                value={gradeLevel}
                onChange={setGradeLevel}
                placeholder="e.g., Grade 7"
              />
              <Field label="School name (optional)" value={schoolName} onChange={setSchoolName} />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="City/Town (optional)" value={city} onChange={setCity} />
              <Field
                label="Province (optional)"
                value={province}
                onChange={setProvince}
                placeholder="e.g., AB"
              />
            </div>

            <div className="mt-4">
              <Field label="Country (optional)" value={country} onChange={setCountry} />
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Choose your plan</div>
            <div className="mt-1 text-sm text-slate-600">
              If you choose a paid plan, a credit card field will appear below.
            </div>

            <div className="mt-5 grid gap-4">
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTier(t.id);
                    setError(null);
                    // Reset any in-progress subscription intent when switching plans
                    setClientSecret(null);
                    setSubscriptionId(null);
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

            {/* Stripe credit card field: shows for ANY paid tier (signup + onboarding) */}
            {paid && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Credit card</div>
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div ref={cardMountRef} />
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Your card is processed securely by Stripe.
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}

            {/* Single button */}
            <button
              onClick={onPrimaryClick}
              disabled={primaryDisabled}
              className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {busy ? "Please wait…" : primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
