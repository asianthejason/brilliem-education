"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSignUp, useUser } from "@clerk/nextjs";
import { loadStripe } from "@stripe/stripe-js";
import type { Stripe, StripeElements } from "@stripe/stripe-js";

type Mode = "signup" | "onboarding";
type Tier = "free" | "lessons" | "lessons_ai";
type PaidTier = Exclude<Tier, "free">;

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

const TIERS: Array<{
  id: Tier;
  name: string;
  price: string;
  bullets: string[];
}> = [
  { id: "free", name: "Free", price: "$0", bullets: ["Browse content", "Basic tools"] },
  { id: "lessons", name: "Lessons", price: "CA$10/mo", bullets: ["Book lessons", "Premium content"] },
  { id: "lessons_ai", name: "Lessons + AI", price: "CA$15/mo", bullets: ["Everything in Lessons", "AI tutor"] },
];

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
      />
    </label>
  );
}

export function GetStartedClient({ mode = "signup" as Mode }: { mode?: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useUser();
  const { isLoaded: signUpLoaded, signUp, setActive } = useSignUp();

  const [tier, setTier] = useState<Tier>("lessons");

  // Signup fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // Verify
  const [verifyCode, setVerifyCode] = useState("");

  // Onboarding fields
  const [gradeLevel, setGradeLevel] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [country, setCountry] = useState("Canada");

  const [step, setStep] = useState<"signup" | "verify" | "onboarding" | "payment">(
    mode === "signup" ? "signup" : "onboarding"
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Payment element state
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const paymentMountedRef = useRef(false);
  const paymentHostRef = useRef<HTMLDivElement | null>(null);


  // Initialize Stripe object once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stripe = await stripePromise;
      if (!cancelled) stripeRef.current = stripe;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mount Payment Element when we have a clientSecret and we're on the payment step
  useEffect(() => {
    const stripe = stripeRef.current;
    if (!stripe) return;
    if (!clientSecret) return;
    if (step !== "payment") return;
    if (!paymentHostRef.current) return;
    if (paymentMountedRef.current) return;

    const elements = stripe.elements({ clientSecret });
    const paymentElement = elements.create("payment");
    paymentElement.mount(paymentHostRef.current);
    elementsRef.current = elements;
    paymentMountedRef.current = true;

    return () => {
      try {
        paymentElement.unmount();
      } catch {}
      elementsRef.current = null;
      paymentMountedRef.current = false;
    };
  }, [clientSecret, step]);

  // Handle returning from a bank-required redirect (3D Secure)
  useEffect(() => {
    const piSecret = params.get("payment_intent_client_secret");
    const sid = params.get("sid");
    const t = params.get("tier") as Tier | null;
    if (!piSecret || !sid || !t) return;

    // only run once per load
    const key = `brilliem_payment_return_${sid}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");

    (async () => {
      try {
        setBusy(true);
        setError(null);
        setInfo("Finishing your payment…");

        const stripe = await stripePromise;
        if (!stripe) throw new Error("Stripe failed to load");

        const { paymentIntent, error: retrieveErr } = await stripe.retrievePaymentIntent(piSecret);
        if (retrieveErr) throw new Error(retrieveErr.message || "Failed to retrieve payment intent");

        if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
          await finalizeActivation({ subscriptionId: sid, tier: t });
          setInfo("Payment successful! Your subscription is active.");
          router.replace("/get-started?postVerify=1");
        } else {
          setError(`Payment not completed (status: ${paymentIntent?.status || "unknown"})`);
          setInfo(null);
        }
      } catch (e: any) {
        setError(e?.message || "Failed to finish payment");
        setInfo(null);
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function finalizeActivation(input: { subscriptionId: string; tier: Tier }) {
    const res = await fetch("/api/stripe/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || "Failed to activate subscription");
    }
  }

  async function startSignup() {
    if (!signUpLoaded || !signUp) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const created = await signUp.create({
        emailAddress: email,
        password,
        firstName,
        lastName,
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
      const complete = await signUp.attemptEmailAddressVerification({ code: verifyCode });
      if (complete.status !== "complete") {
        throw new Error("Verification not complete. Please try again.");
      }
      await setActive({ session: complete.createdSessionId });
      setStep("onboarding");
      setInfo("Email verified. Finish setup below.");
    } catch (e: any) {
      setError(e?.errors?.[0]?.message || e?.message || "Invalid verification code");
    } finally {
      setBusy(false);
    }
  }

  async function submitOnboarding() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      // Save onboarding + selected tier request
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          gradeLevel,
          schoolName,
          city,
          province,
          country,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to save onboarding");
      }

      if (tier === "free") {
        setInfo("All set! Your free account is ready.");
        router.push("/");
        return;
      }

      // Create subscription + get client_secret to render Payment Element on-page
      const tierToSend: PaidTier = tier;
      const intentRes = await fetch("/api/stripe/subscription-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tierToSend }),
      });
      if (!intentRes.ok) {
        const text = await intentRes.text().catch(() => "");
        throw new Error(text || "Failed to start subscription");
      }
      const data = (await intentRes.json()) as { subscriptionId: string; clientSecret: string };
      setSubscriptionId(data.subscriptionId);
      setClientSecret(data.clientSecret);
      setStep("payment");
      setInfo(null);
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPayment() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (!subscriptionId || !clientSecret) throw new Error("Missing subscription info");
      const stripe = await stripePromise;
      if (!stripe) throw new Error("Stripe failed to load");
      const elements = elementsRef.current;
      if (!elements) throw new Error("Payment form not ready yet");

      const origin = window.location.origin;
      const returnUrl = `${origin}/get-started?postVerify=1&paymentReturn=1&sid=${encodeURIComponent(
        subscriptionId
      )}&tier=${encodeURIComponent(tier)}`;

      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });

      if (result.error) {
        throw new Error(result.error.message || "Payment failed");
      }

      // If no redirect was required, we can finalize immediately
      const status = result.paymentIntent?.status;
      if (status === "succeeded" || status === "processing") {
        await finalizeActivation({ subscriptionId, tier });
        setInfo("Payment successful! Your subscription is active.");
        router.push("/");
      } else {
        setInfo("Payment submitted. If your bank needs verification, you’ll be returned to this page.");
      }
    } catch (e: any) {
      setError(e?.message || "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-white">Get started</h1>
      <p className="mt-2 text-white/70">Create your account and pick a plan.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {TIERS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTier(t.id)}
            className={cx(
              "rounded-2xl border p-4 text-left transition",
              tier === t.id ? "border-white/30 bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"
            )}
          >
            <div className="text-base font-semibold text-white">{t.name}</div>
            <div className="mt-1 text-sm text-white/70">{t.price}</div>
            <ul className="mt-3 space-y-1 text-sm text-white/60">
              {t.bullets.map((b) => (
                <li key={b}>• {b}</li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      {error && <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
      {info && <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">{info}</div>}

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

          {user?.id && (
            <div className="mt-3 text-xs text-white/50">
              You are already signed in. You can skip to onboarding/payment.
            </div>
          )}
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

      {/* STEP: ONBOARDING */}
      {step === "onboarding" && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm font-semibold text-white">A couple quick details</div>
          <div className="mt-1 text-sm text-white/70">This helps personalize your experience.</div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Grade level" value={gradeLevel} onChange={setGradeLevel} placeholder="10" />
            <Field label="School name" value={schoolName} onChange={setSchoolName} placeholder="Your school" />
            <Field label="City" value={city} onChange={setCity} placeholder="Calgary" />
            <Field label="Province" value={province} onChange={setProvince} placeholder="AB" />
            <Field label="Country" value={country} onChange={setCountry} placeholder="Canada" />
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={submitOnboarding}
            className={cx(
              "mt-5 w-full rounded-xl px-4 py-2 text-sm font-semibold",
              disabled ? "bg-white/5 text-white/30" : "bg-white text-black hover:bg-white/90"
            )}
          >
            {busy ? (tier === "free" ? "Saving…" : "Continuing…") : tier === "free" ? "Finish" : "Continue to payment"}
          </button>
        </div>
      )}

      {/* STEP: PAYMENT */}
      {step === "payment" && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm font-semibold text-white">Payment</div>
          <div className="mt-1 text-sm text-white/70">
            Complete your subscription without leaving this page.
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
            <div ref={(el) => (paymentHostRef.current = el)} />
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={confirmPayment}
            className={cx(
              "mt-5 w-full rounded-xl px-4 py-2 text-sm font-semibold",
              disabled ? "bg-white/5 text-white/30" : "bg-white text-black hover:bg-white/90"
            )}
          >
            {busy ? "Processing…" : "Subscribe"}
          </button>

          <div className="mt-3 text-xs text-white/50">
            Note: some banks require an extra verification step (3D Secure). If so, you’ll be brought back to this page automatically.
          </div>
        </div>
      )}
    </div>
  );
}
