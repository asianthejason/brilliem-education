"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";

type Tier = "none" | "free" | "lessons" | "lessons_ai";
type PaidTier = Exclude<Tier, "none" | "free">;

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
    bullets: ["Browse the site", "Access the first lesson in every unit (coming soon)", "Basic tools"],
    accent: "from-slate-700 to-slate-900",
  },
  {
    id: "lessons",
    name: "Lessons",
    price: "$15 / month",
    bullets: ["Unlimited access to all lessons", "Premium content", "Progress tracking (coming soon)"],
    accent: "from-blue-600 to-fuchsia-600",
  },
  {
    id: "lessons_ai",
    name: "Lessons + AI Tutor",
    price: "$30 / month",
    bullets: ["Unlimited lessons", "AI Tutor chat + photo homework help", "Priority features (coming soon)"],
    accent: "from-emerald-600 to-cyan-600",
  },
];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function DashboardPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, isLoaded } = useUser();

  const tier = ((user?.unsafeMetadata?.tier as Tier) || "none") as Tier;
  const grade = (user?.unsafeMetadata?.gradeLevel as string) || "Not set yet";

  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Payment element state (no @stripe/react-stripe-js needed)
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [targetTier, setTargetTier] = useState<PaidTier | null>(null);

  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const paymentMountedRef = useRef(false);
  const paymentHostRef = useRef<HTMLDivElement | null>(null);

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  const canPay = useMemo(() => !!publishableKey, [publishableKey]);

  // Load Stripe once (client)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!publishableKey) return;
      const stripe = await loadStripe(publishableKey);
      if (!cancelled) stripeRef.current = stripe;
    })();
    return () => {
      cancelled = true;
    };
  }, [publishableKey]);

  // Mount Payment Element when ready
  useEffect(() => {
    const stripe = stripeRef.current;
    if (!stripe) return;
    if (!clientSecret) return;
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
  }, [clientSecret]);

  // Handle returning from a bank-required redirect (3DS)
  useEffect(() => {
    const piSecret = params.get("payment_intent_client_secret");
    const sid = params.get("sid");
    const t = params.get("tier") as PaidTier | null;

    if (!piSecret || !sid || !t) return;

    const key = `brilliem_dashboard_payment_return_${sid}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");

    (async () => {
      try {
        setBusy(true);
        setError(null);
        setInfo("Finishing your payment…");

        const stripe = stripeRef.current;
        if (!stripe) throw new Error("Stripe failed to load");

        const { paymentIntent, error: retrieveErr } = await stripe.retrievePaymentIntent(piSecret);
        if (retrieveErr) throw new Error(retrieveErr.message || "Failed to retrieve payment intent");

        if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
          await finalizeActivation({ subscriptionId: sid, tier: t });
          setInfo("Payment successful! Your subscription is active.");
          setClientSecret(null);
          setSubscriptionId(null);
          setTargetTier(null);
          router.replace("/dashboard");
          router.refresh();
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

  async function finalizeActivation(input: { subscriptionId: string; tier: PaidTier }) {
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

  async function setFreeTier() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await user.update({
        unsafeMetadata: {
          ...(user.unsafeMetadata || {}),
          tier: "free",
        },
      });
      setInfo("Free tier selected. You can now browse Lessons.");
      router.refresh();
    } catch (e: any) {
      setError(e?.errors?.[0]?.message || e?.message || "Failed to update tier");
    } finally {
      setBusy(false);
    }
  }

  async function startPaidTier(nextTier: PaidTier) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (!canPay) throw new Error("Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
      const res = await fetch("/api/stripe/subscription-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: nextTier }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to start subscription");
      }
      const data = (await res.json()) as { subscriptionId: string; clientSecret: string };
      setSubscriptionId(data.subscriptionId);
      setClientSecret(data.clientSecret);
      setTargetTier(nextTier);
      setInfo(null);
    } catch (e: any) {
      setError(e?.message || "Could not start payment");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPaidTier() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (!subscriptionId || !clientSecret || !targetTier) throw new Error("Payment not ready");
      const stripe = stripeRef.current;
      if (!stripe) throw new Error("Stripe failed to load");
      const elements = elementsRef.current;
      if (!elements) throw new Error("Payment form not ready yet");

      const origin = window.location.origin;
      const returnUrl = `${origin}/dashboard?paymentReturn=1&sid=${encodeURIComponent(
        subscriptionId
      )}&tier=${encodeURIComponent(targetTier)}`;

      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });

      if (result.error) throw new Error(result.error.message || "Payment failed");

      // If no redirect was required, we can finalize immediately
      const status = result.paymentIntent?.status;
      if (status === "succeeded" || status === "processing") {
        await finalizeActivation({ subscriptionId, tier: targetTier });
        setInfo("Payment successful! Your subscription is active.");
        setClientSecret(null);
        setSubscriptionId(null);
        setTargetTier(null);
        router.refresh();
      } else {
        setInfo("Payment submitted. If your bank needs verification, you’ll be returned here automatically.");
      }
    } catch (e: any) {
      setError(e?.message || "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  const currentLabel =
    tier === "none"
      ? "No tier selected"
      : tier === "free"
      ? "Free"
      : tier === "lessons"
      ? "Lessons"
      : "Lessons + AI Tutor";

  if (!isLoaded) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-slate-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Your Dashboard</h1>
            <p className="mt-2 text-slate-600">
              Grade level: <span className="font-semibold text-slate-900">{grade}</span>
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Current tier:</span> {currentLabel}
          </div>
        </div>
      </div>

      {(info || error) && (
        <div
          className={cx(
            "rounded-3xl border p-5 text-sm",
            error ? "border-red-200 bg-red-50 text-red-900" : "border-blue-200 bg-blue-50 text-blue-900"
          )}
        >
          <div className="font-semibold">{error ? "Action required" : "Update"}</div>
          <div className="mt-1">{error || info}</div>
        </div>
      )}

      {/* Subscription section */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Subscription</h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose a tier to unlock content. You can change plans anytime.
            </p>
          </div>
          {!canPay && (
            <div className="text-xs font-semibold text-amber-800">
              Stripe publishable key missing (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {TIERS.map((t) => {
            const isCurrent = tier === t.id;
            const isSelected = tier !== "none";

            return (
              <div key={t.id} className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-bold text-slate-900">{t.name}</div>
                    <div className="mt-1 text-sm text-slate-600">{t.price}</div>
                  </div>

                  {isCurrent && (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                      Current
                    </span>
                  )}
                </div>

                <ul className="mt-4 space-y-2 text-sm text-slate-700">
                  {t.bullets.map((b) => (
                    <li key={b} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-5">
                  {t.id === "free" ? (
                    <button
                      type="button"
                      disabled={busy || isCurrent}
                      onClick={setFreeTier}
                      className={cx(
                        "w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition",
                        isCurrent || busy
                          ? "bg-slate-300"
                          : "bg-gradient-to-r from-slate-700 to-slate-900 hover:brightness-110"
                      )}
                    >
                      {isCurrent ? "Selected" : busy ? "Saving…" : "Choose Free"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || isCurrent || !canPay}
                      onClick={() => startPaidTier(t.id as PaidTier)}
                      className={cx(
                        "w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition",
                        isCurrent || busy || !canPay
                          ? "bg-slate-300"
                          : `bg-gradient-to-r ${t.accent} hover:brightness-110`
                      )}
                    >
                      {isCurrent
                        ? "Selected"
                        : busy
                          ? "Starting…"
                          : isSelected
                            ? "Change to this plan"
                            : "Select this plan"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Embedded payment element when user selects a paid tier */}
        {clientSecret && subscriptionId && targetTier && (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-sm font-semibold text-slate-900">Payment</div>
            <div className="mt-1 text-sm text-slate-600">
              Complete your subscription without leaving the dashboard.
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div
                ref={(el) => {
                  paymentHostRef.current = el;
                }}
              />
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={confirmPaidTier}
              className={cx(
                "mt-4 w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition",
                busy ? "bg-slate-300" : "bg-slate-900 hover:bg-slate-800"
              )}
            >
              {busy ? "Processing…" : "Confirm & Subscribe"}
            </button>

            <div className="mt-2 text-xs text-slate-500">
              Some banks require an extra verification step (3D Secure). If so, you’ll be brought back here automatically.
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Progress by grade</div>
          <p className="mt-2 text-sm text-slate-600">
            Next: we’ll track mastery by unit/skill and show charts here.
          </p>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            Example: Grade 7 — 12% complete
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Recommended next steps</div>
          <p className="mt-2 text-sm text-slate-600">
            Next: show “continue where you left off” and weak-skill review.
          </p>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            Example: Fractions — review common denominators
          </div>
        </div>
      </div>
    </div>
  );
}
