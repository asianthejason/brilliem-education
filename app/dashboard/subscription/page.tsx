"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";

type Tier = "none" | "free" | "lessons" | "lessons_ai";
type PaidTier = Exclude<Tier, "none" | "free">;

type CardSummary = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

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

function tierLabel(tier: Tier) {
  if (tier === "none") return "No tier selected";
  if (tier === "free") return "Free";
  if (tier === "lessons") return "Lessons";
  return "Lessons + AI Tutor";
}

function tierRank(tier: Tier) {
  if (tier === "lessons_ai") return 2;
  if (tier === "lessons") return 1;
  if (tier === "free") return 0;
  return -1;
}

function formatDate(tsSeconds?: number | null) {
  if (!tsSeconds) return null;
  try {
    const d = new Date(tsSeconds * 1000);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return null;
  }
}

export default function SubscriptionPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, isLoaded } = useUser();

  const [currentTier, setCurrentTier] = useState<Tier>("none");
  const [pendingTier, setPendingTier] = useState<Tier | null>(null);
  const [pendingEffective, setPendingEffective] = useState<number | null>(null);

  const grade = (user?.unsafeMetadata?.gradeLevel as string) || "Not set yet";

  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Saved payment method (card) display + update flow
  const [hasStripeCustomer, setHasStripeCustomer] = useState(false);
  const [savedCard, setSavedCard] = useState<CardSummary | null>(null);
  const [pmModalOpen, setPmModalOpen] = useState(false);
  const [pmClientSecret, setPmClientSecret] = useState<string | null>(null);
  const [pmSetupIntentId, setPmSetupIntentId] = useState<string | null>(null);

  const pmElementsRef = useRef<StripeElements | null>(null);
  const pmMountedRef = useRef(false);
  const pmHostRef = useRef<HTMLDivElement | null>(null);

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

  // Initialize local tier(s) from Clerk user
  useEffect(() => {
    const t = ((user?.unsafeMetadata?.tier as Tier) || "none") as Tier;
    setCurrentTier(t);

    const pt = (user?.unsafeMetadata?.pendingTier as Tier | undefined) || null;
    const pe = (user?.unsafeMetadata?.pendingTierEffective as number | undefined) || null;
    setPendingTier(pt);
    setPendingEffective(pe);
  }, [user?.unsafeMetadata?.tier, user?.unsafeMetadata?.pendingTier, user?.unsafeMetadata?.pendingTierEffective]);

  // Load the currently-saved payment method (masked card), if this user has a Stripe customer.
  useEffect(() => {
    if (!isLoaded) return;
    void fetchSavedCard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, user?.id]);

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

  // Mount Payment Element for payment method updates (SetupIntent)
  useEffect(() => {
    const stripe = stripeRef.current;
    if (!stripe) return;
    if (!pmModalOpen) return;
    if (!pmClientSecret) return;
    if (!pmHostRef.current) return;
    if (pmMountedRef.current) return;

    const elements = stripe.elements({ clientSecret: pmClientSecret });
    const paymentElement = elements.create("payment");
    paymentElement.mount(pmHostRef.current);

    pmElementsRef.current = elements;
    pmMountedRef.current = true;

    return () => {
      try {
        paymentElement.unmount();
      } catch {}
      pmElementsRef.current = null;
      pmMountedRef.current = false;
    };
  }, [pmClientSecret, pmModalOpen]);

  function clearPaymentState() {
    setClientSecret(null);
    setSubscriptionId(null);
    setTargetTier(null);
  }

  function clearPaymentMethodUpdate() {
    setPmClientSecret(null);
    setPmSetupIntentId(null);
    setPmModalOpen(false);
  }

  async function fetchSavedCard() {
    try {
      const res = await fetch("/api/stripe/payment-method", { method: "GET" });
      if (!res.ok) return;
      const data = (await res.json()) as
        | { hasCustomer: false; hasPaymentMethod: false }
        | { hasCustomer: true; hasPaymentMethod: boolean; brand?: string; last4?: string; expMonth?: number; expYear?: number };

      setHasStripeCustomer(!!data.hasCustomer);
      if (data.hasCustomer && data.hasPaymentMethod && data.brand && data.last4 && data.expMonth && data.expYear) {
        setSavedCard({
          brand: data.brand,
          last4: data.last4,
          expMonth: data.expMonth,
          expYear: data.expYear,
        });
      } else {
        setSavedCard(null);
      }
    } catch {
      // ignore
    }
  }

  async function refreshClerkTier(optimistic?: Tier) {
    if (optimistic) setCurrentTier(optimistic);

    try {
      if (!user) return;
      const reloaded = await user.reload();

      const t = ((reloaded?.unsafeMetadata?.tier as Tier) || optimistic || "none") as Tier;
      setCurrentTier(t);

      const pt = (reloaded?.unsafeMetadata?.pendingTier as Tier | undefined) || null;
      const pe = (reloaded?.unsafeMetadata?.pendingTierEffective as number | undefined) || null;
      setPendingTier(pt);
      setPendingEffective(pe);
    } catch {
      // keep optimistic tier
    } finally {
      router.refresh();
    }
  }

  function hardRefreshSelf(query?: string) {
    const base = "/dashboard/subscription";
    const url = query ? `${base}?${query}` : base;
    window.location.assign(url);
  }

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

  // Handle returning from a bank-required redirect (3DS)
  useEffect(() => {
    const piSecret = params.get("payment_intent_client_secret");
    const sid = params.get("sid");
    const t = params.get("tier") as PaidTier | null;

    if (!piSecret || !sid || !t) return;

    const key = `brilliem_subscription_payment_return_${sid}`;
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

          clearPaymentState();
          setPendingTier(null);
          setPendingEffective(null);

          setInfo("Payment successful! Your subscription is active.");
          await refreshClerkTier(t);

          hardRefreshSelf("success=1");
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

  // Handle returning from a bank-required redirect for updating a saved card (SetupIntent)
  useEffect(() => {
    const setupIntentId = params.get("setup_intent") || params.get("si");
    if (!setupIntentId) return;

    const key = `brilliem_setup_intent_return_${setupIntentId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");

    (async () => {
      try {
        setBusy(true);
        setError(null);
        setInfo("Saving your new card…");

        const res = await fetch("/api/stripe/payment-method/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setupIntentId }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || "Failed to update payment method");
        }

        await fetchSavedCard();
        clearPaymentMethodUpdate();
        setInfo("Payment method updated.");
        hardRefreshSelf("pmUpdated=1");
      } catch (e: any) {
        setError(e?.message || "Failed to update payment method");
        setInfo(null);
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function setFreeTier() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/stripe/change-tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "free" }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to switch to Free tier");
      }

      const data = (await res.json()) as
        | { mode: "free_immediate" }
        | { mode: "downgrade_scheduled"; effectiveDate: number };

      clearPaymentState();

      if (data.mode === "downgrade_scheduled") {
        setPendingTier("free");
        setPendingEffective(data.effectiveDate);

        const d = formatDate(data.effectiveDate);
        setInfo(`Downgrade scheduled. You’ll switch to Free on ${d || "your next renewal date"}.`);

        await refreshClerkTier();
        hardRefreshSelf("scheduled=1");
      } else {
        setPendingTier(null);
        setPendingEffective(null);

        setInfo("You’re now on the Free tier.");
        await refreshClerkTier("free");
        hardRefreshSelf("success=1");
      }
    } catch (e: any) {
      setError(e?.errors?.[0]?.message || e?.message || "Failed to switch to Free tier");
    } finally {
      setBusy(false);
    }
  }

  async function changePaidTier(nextTier: PaidTier) {
    if (!user) return;
    if (nextTier === currentTier) return;

    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      const res = await fetch("/api/stripe/change-tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: nextTier }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to change plan");
      }

      const data = (await res.json()) as
        | { mode: "upgraded"; amountDue?: number; currency?: string }
        | { mode: "payment_required"; subscriptionId: string; clientSecret: string; amountDue?: number; currency?: string }
        | { mode: "downgrade_scheduled"; effectiveDate: number };

      if (data.mode === "downgrade_scheduled") {
        setPendingTier(nextTier);
        setPendingEffective(data.effectiveDate);

        const d = formatDate(data.effectiveDate);
        setInfo(`Downgrade scheduled. You’ll switch on ${d || "your next renewal date"}.`);

        await refreshClerkTier();
        hardRefreshSelf("scheduled=1");
        return;
      }

      if (data.mode === "payment_required") {
        setSubscriptionId(data.subscriptionId);
        setClientSecret(data.clientSecret);
        setTargetTier(nextTier);

        if (typeof data.amountDue === "number") {
          const dollars = (data.amountDue / 100).toFixed(2);
          setInfo(`Upgrade requires a prorated payment of $${dollars} ${data.currency?.toUpperCase() || ""}.`);
        } else {
          setInfo("Upgrade requires a prorated payment. Please complete payment below.");
        }
        return;
      }

      // Upgraded successfully (Stripe auto-paid the proration invoice with saved method)
      setPendingTier(null);
      setPendingEffective(null);

      if (typeof data.amountDue === "number" && data.amountDue > 0) {
        const dollars = (data.amountDue / 100).toFixed(2);
        setInfo(`Upgraded! Prorated charge: $${dollars} ${data.currency?.toUpperCase() || ""}.`);
      } else {
        setInfo("Upgraded!");
      }

      await refreshClerkTier(nextTier);
      hardRefreshSelf("success=1");
    } catch (e: any) {
      setError(e?.message || "Could not change plan");
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
      const returnUrl = `${origin}/dashboard/subscription?paymentReturn=1&sid=${encodeURIComponent(
        subscriptionId
      )}&tier=${encodeURIComponent(targetTier)}`;

      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });

      if (result.error) throw new Error(result.error.message || "Payment failed");

      const status = result.paymentIntent?.status;
      if (status === "succeeded" || status === "processing") {
        await finalizeActivation({ subscriptionId, tier: targetTier });

        clearPaymentState();
        setPendingTier(null);
        setPendingEffective(null);

        setInfo("Payment successful! Your subscription is active.");
        await refreshClerkTier(targetTier);

        hardRefreshSelf("success=1");
      } else {
        setInfo("Payment submitted. If your bank needs verification, you’ll be returned here automatically.");
      }
    } catch (e: any) {
      setError(e?.message || "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  async function beginUpdateCard() {
    setError(null);
    setInfo(null);

    try {
      if (!canPay) throw new Error("Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");

      setPmModalOpen(true);
      setPmClientSecret(null);
      setPmSetupIntentId(null);

      const res = await fetch("/api/stripe/payment-method/setup-intent", {
        method: "POST",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to start payment method update");
      }

      const data = (await res.json()) as { setupIntentId: string; clientSecret: string };
      setPmSetupIntentId(data.setupIntentId);
      setPmClientSecret(data.clientSecret);
    } catch (e: any) {
      clearPaymentMethodUpdate();
      setError(e?.message || "Failed to start payment method update");
    }
  }

  async function confirmUpdateCard() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (!pmClientSecret || !pmSetupIntentId) throw new Error("Payment method form not ready");
      const stripe = stripeRef.current;
      if (!stripe) throw new Error("Stripe failed to load");
      const elements = pmElementsRef.current;
      if (!elements) throw new Error("Payment form not ready yet");

      const origin = window.location.origin;
      const returnUrl = `${origin}/dashboard/subscription?si=${encodeURIComponent(pmSetupIntentId)}`;

      const result = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });

      if (result.error) throw new Error(result.error.message || "Failed to update card");

      const status = result.setupIntent?.status;
      if (status === "succeeded" || status === "processing") {
        const setupIntentId = result.setupIntent?.id || pmSetupIntentId;

        const res = await fetch("/api/stripe/payment-method/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setupIntentId }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || "Failed to save updated payment method");
        }

        await fetchSavedCard();
        clearPaymentMethodUpdate();
        setInfo("Payment method updated.");
      } else {
        setInfo("Update submitted. If your bank needs verification, you’ll be returned here automatically.");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to update card");
    } finally {
      setBusy(false);
    }
  }

  if (!isLoaded) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-slate-600">Loading…</div>
      </div>
    );
  }

  const pendingText =
    pendingTier && pendingTier !== currentTier
      ? `Pending: ${tierLabel(pendingTier)}${
          pendingEffective ? ` (effective ${formatDate(pendingEffective) || "next billing period"})` : ""
        }`
      : null;

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Subscription</h1>
            <p className="mt-2 text-slate-600">
              Grade level: <span className="font-semibold text-slate-900">{grade}</span>
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
            <div>
              <span className="font-semibold text-slate-900">Current tier:</span> {tierLabel(currentTier)}
            </div>
            {pendingText && <div className="mt-1 text-xs text-slate-600">{pendingText}</div>}
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

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Choose your plan</h2>
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
            const isCurrent = currentTier === t.id;
            const isPaid = t.id !== "free";
            const isScheduled = pendingTier === t.id && !isCurrent;

            const disabled = busy || isCurrent || isScheduled || (isPaid && !canPay);

            const buttonText = isCurrent
              ? "Selected"
              : isScheduled
                ? "Scheduled"
                : busy
                  ? isPaid
                    ? "Starting…"
                    : "Saving…"
                  : currentTier !== "none"
                    ? "Change to this plan"
                    : "Select this plan";

            return (
              <div key={t.id} className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-bold text-slate-900">{t.name}</div>
                    <div className="mt-1 text-sm text-slate-600">{t.price}</div>
                  </div>

                  {isCurrent ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                      Current
                    </span>
                  ) : isScheduled ? (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
                      Scheduled
                    </span>
                  ) : null}
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
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (t.id === "free") return void setFreeTier();

                      const currentIsPaid = currentTier === "lessons" || currentTier === "lessons_ai";
                      const nextIsPaid = t.id === "lessons" || t.id === "lessons_ai";

                      if (currentIsPaid && nextIsPaid) return void changePaidTier(t.id as PaidTier);
                      return void startPaidTier(t.id as PaidTier);
                    }}
                    className={cx(
                      "w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition",
                      disabled ? "bg-slate-300" : `bg-gradient-to-r ${t.accent} hover:brightness-110`
                    )}
                  >
                    {buttonText}
                  </button>
                </div>

                {isPaid && currentTier !== "none" && currentTier !== "free" && !isCurrent && !isScheduled && (
                  <div className="mt-2 text-xs text-slate-500">
                    {tierRank(t.id) < tierRank(currentTier)
                      ? "Downgrades take effect next billing period."
                      : "Upgrades take effect immediately with proration."}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {hasStripeCustomer && (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Payment method</div>
                {savedCard ? (
                  <div className="mt-1 text-sm text-slate-700">
                    {savedCard.brand.toUpperCase()} •••• {savedCard.last4} · Expires {String(savedCard.expMonth).padStart(2, "0")}/{
                      String(savedCard.expYear).slice(-2)
                    }
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-slate-600">No payment method on file.</div>
                )}
              </div>

              <button
                type="button"
                disabled={busy || !canPay}
                onClick={beginUpdateCard}
                className={cx(
                  "rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition",
                  busy || !canPay ? "bg-slate-300" : "bg-slate-900 hover:bg-slate-800"
                )}
              >
                {savedCard ? "Update card" : "Add card"}
              </button>
            </div>

            {!canPay && (
              <div className="mt-2 text-xs font-semibold text-amber-800">
                Stripe publishable key missing (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).
              </div>
            )}

            <div className="mt-2 text-xs text-slate-500">
              This card will be used for your subscription invoices and upgrades.
            </div>
          </div>
        )}

        {clientSecret && subscriptionId && targetTier && (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-sm font-semibold text-slate-900">Payment</div>
            <div className="mt-1 text-sm text-slate-600">Complete this payment without leaving the page.</div>

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
              {busy ? "Processing…" : "Confirm & Pay"}
            </button>

            <div className="mt-2 text-xs text-slate-500">
              Some banks require an extra verification step (3D Secure). If so, you’ll be brought back here automatically.
            </div>
          </div>
        )}
      </div>

      {pmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-slate-900">{savedCard ? "Update card" : "Add card"}</div>
                <div className="mt-1 text-sm text-slate-600">
                  Enter your new card securely. It will become your default payment method in Stripe.
                </div>
              </div>

              <button
                type="button"
                onClick={clearPaymentMethodUpdate}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {pmClientSecret ? (
                <div
                  ref={(el) => {
                    pmHostRef.current = el;
                  }}
                />
              ) : (
                <div className="text-sm text-slate-600">Loading secure card form…</div>
              )}
            </div>

            <button
              type="button"
              disabled={busy || !pmClientSecret}
              onClick={confirmUpdateCard}
              className={cx(
                "mt-4 w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition",
                busy || !pmClientSecret ? "bg-slate-300" : "bg-slate-900 hover:bg-slate-800"
              )}
            >
              {busy ? "Saving…" : "Save card"}
            </button>

            <div className="mt-2 text-xs text-slate-500">
              Some banks require an extra verification step (3D Secure). If so, you’ll be returned here automatically.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
