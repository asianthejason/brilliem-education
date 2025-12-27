"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { loadStripe, type Stripe, type StripeElements, type StripeCardElement } from "@stripe/stripe-js";

type Tier = "none" | "free" | "lessons" | "lessons_ai";
type PaidTier = Exclude<Tier, "none" | "free">;
type BillingInterval = "month" | "year";

type CardSummary = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

type PreviewLine = {
  description: string;
  amount: number;
  currency: string;
  proration: boolean;
  periodStart?: number;
  periodEnd?: number;
};

type PreviewResponse = {
  currentTier: "free" | "lessons" | "lessons_ai";
  desiredTier: "free" | "lessons" | "lessons_ai";
  currentInterval: BillingInterval;
  desiredInterval: BillingInterval;
  action: "none" | "signup" | "upgrade" | "downgrade" | "cancel_to_free" | "switch_to_free_immediate";
  hasCustomer: boolean;
  hasPaymentMethod: boolean;
  paymentMethod: null | { brand: string; last4: string; expMonth: number; expYear: number };
  currency: string;
  dueNow: number;
  nextAmount: number;
  nextPaymentAt: number | null;
  effectiveAt: number | null;
  lines: PreviewLine[];
  requiresPaymentMethod: boolean;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function tierLabel(t: Tier) {
  if (t === "lessons_ai") return "Lessons + AI Tutor";
  if (t === "lessons") return "Lessons";
  if (t === "free") return "Free";
  return "Not set";
}

function intervalLabel(i: BillingInterval) {
  return i === "year" ? "Yearly" : "Monthly";
}

function formatMoney(cents: number, currency: string) {
  const amt = (cents / 100).toFixed(2);
  return `${amt} ${currency.toUpperCase()}`;
}

function formatDate(epochSeconds: number | null | undefined) {
  if (!epochSeconds) return null;
  try {
    return new Date(epochSeconds * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

export default function SubscriptionPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, isLoaded } = useUser();

  // Tier + pending metadata (from Clerk)
  const currentTier = (user?.unsafeMetadata?.tier as Tier | undefined) || "none";
  const currentInterval = ((user?.unsafeMetadata?.billingInterval as BillingInterval | undefined) || "month") as BillingInterval;
  const grade = (user?.unsafeMetadata?.grade as string | undefined) || "Not set yet";

  const [pendingTier, setPendingTier] = useState<Tier | null>(
    ((user?.unsafeMetadata?.pendingTier as Tier | undefined) || null) as any
  );
  const [pendingInterval, setPendingInterval] = useState<BillingInterval | null>(
    ((user?.unsafeMetadata?.pendingBillingInterval as BillingInterval | undefined) || null) as any
  );
  const [pendingEffective, setPendingEffective] = useState<number | null>(
    (user?.unsafeMetadata?.pendingTierEffective as number | undefined) || null
  );

  const didInitPendingRef = useRef(false);

  useEffect(() => {
    if (didInitPendingRef.current) return;
    if (!isLoaded || !user) return;

    // On hard refresh, `useState(...)` above may initialize while `user` is still undefined.
    // Sync pending/scheduled fields once the user is available so the UI always shows scheduled changes.
    const pt = (user?.unsafeMetadata?.pendingTier as Tier | undefined) || null;
    const pi = (user?.unsafeMetadata?.pendingBillingInterval as BillingInterval | undefined) || null;
    const pe = (user?.unsafeMetadata?.pendingTierEffective as number | undefined) || null;

    setPendingTier(pt);
    setPendingInterval(pi);
    setPendingEffective(pe);

    didInitPendingRef.current = true;
  }, [isLoaded, user?.id]);

  // Plan picker interval (Monthly / Yearly)
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("month");
  const didInitIntervalRef = useRef(false);

  useEffect(() => {
    if (didInitIntervalRef.current) return;
    if (!isLoaded || !user) return;
    // Default the toggle to the user's current billing interval so "Current" only appears in that view.
    setBillingInterval(currentInterval);
    didInitIntervalRef.current = true;
  }, [isLoaded, user, currentInterval]);

  // Global UI state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Saved card + next payment (pulled from Stripe)
  const [hasStripeCustomer, setHasStripeCustomer] = useState(false);
  const [savedCard, setSavedCard] = useState<CardSummary | null>(null);
  const [nextPaymentAt, setNextPaymentAt] = useState<number | null>(null);
  const [nextPaymentAmount, setNextPaymentAmount] = useState<number | null>(null);
  const [nextPaymentCurrency, setNextPaymentCurrency] = useState<string | null>(null);
  const [cancelsAt, setCancelsAt] = useState<number | null>(null);

  // Stripe client (shared)
  const stripeRef = useRef<Stripe | null>(null);
  const pubKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
  const canPay = !!pubKey;

  async function ensureStripe(): Promise<Stripe> {
    const existing = stripeRef.current;
    if (existing) return existing;
    if (!canPay) throw new Error("Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    const s = await loadStripe(pubKey);
    if (!s) throw new Error("Stripe failed to load");
    stripeRef.current = s;
    return s;
  }

  // ---------- Payment method update (card on file) ----------
  const [pmModalOpen, setPmModalOpen] = useState(false);
  const [pmClientSecret, setPmClientSecret] = useState<string | null>(null);
  const [pmSetupIntentId, setPmSetupIntentId] = useState<string | null>(null);
  const pmElementsRef = useRef<StripeElements | null>(null);
  const pmCardElRef = useRef<StripeCardElement | null>(null);
  const pmCardMountRef = useRef<HTMLDivElement | null>(null);

  function clearPmState() {
    try {
      pmCardElRef.current?.unmount();
    } catch {}
    pmElementsRef.current = null;
    pmCardElRef.current = null;
    setPmClientSecret(null);
    setPmSetupIntentId(null);
    setPmModalOpen(false);
  }

  async function mountPmCardElement() {
    if (!pmModalOpen) return;
    if (!pmClientSecret) return;
    const mount = pmCardMountRef.current;
    if (!mount) return;

    const stripe = await ensureStripe();
    // SetupIntent client secret isn't used by Elements here; CardElement doesn't need it.
    const elements = stripe.elements({
      appearance: { theme: "stripe" },
    });

    const card = elements.create("card", {
      hidePostalCode: false,
    });

    // Mount
    mount.innerHTML = "";
    card.mount(mount);

    pmElementsRef.current = elements;
    pmCardElRef.current = card;
  }

  async function fetchBillingInfo() {
    try {
      const res = await fetch("/api/stripe/payment-method", { method: "GET" });
      if (!res.ok) return;

      const data = (await res.json()) as any;

      setHasStripeCustomer(!!data.hasCustomer);

      if (data.hasCustomer && data.hasPaymentMethod && data.brand && data.last4 && data.expMonth && data.expYear) {
        setSavedCard({
          brand: String(data.brand),
          last4: String(data.last4),
          expMonth: Number(data.expMonth),
          expYear: Number(data.expYear),
        });
      } else {
        setSavedCard(null);
      }

      setNextPaymentAt(typeof data.nextPaymentAt === "number" ? data.nextPaymentAt : null);
      setNextPaymentAmount(typeof data.nextPaymentAmount === "number" ? data.nextPaymentAmount : null);
      setNextPaymentCurrency(typeof data.nextPaymentCurrency === "string" ? data.nextPaymentCurrency : null);
      setCancelsAt(typeof data.cancelsAt === "number" ? data.cancelsAt : null);
    } catch {
      // ignore
    }
  }

  async function beginUpdateCard() {
    setError(null);
    setInfo(null);

    try {
      const res = await fetch("/api/stripe/payment-method/setup-intent", { method: "POST" });
      if (!res.ok) throw new Error(await res.text().catch(() => "Failed to start card update"));

      const data = (await res.json()) as { setupIntentId: string; clientSecret: string };
      setPmSetupIntentId(data.setupIntentId);
      setPmClientSecret(data.clientSecret);
      setPmModalOpen(true);
    } catch (e: any) {
      setError(e?.message || "Failed to start card update");
    }
  }

  async function confirmUpdateCard() {
    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      if (!pmClientSecret || !pmSetupIntentId) throw new Error("Card update not ready");
      const stripe = await ensureStripe();

      // Confirm SetupIntent with CardElement
      const cardEl = pmCardElRef.current;
      if (!cardEl) throw new Error("Card form not ready");

      const returnUrl = `${window.location.origin}/dashboard/subscription?setupReturn=1&si=${encodeURIComponent(
        pmSetupIntentId
      )}`;

      const result = await stripe.confirmCardSetup(pmClientSecret, {
        payment_method: { card: cardEl },
        return_url: returnUrl,
      });

      if (result.error) throw new Error(result.error.message || "Card verification failed");

      const si = result.setupIntent;
      const status = si?.status;

      if (status === "succeeded" || status === "processing") {
        // Tell server to set as default payment method
        await fetch("/api/stripe/payment-method/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setupIntentId: si.id }),
        }).catch(() => null);

        setInfo("Payment method updated.");
        clearPmState();
        await fetchBillingInfo();
      } else {
        setInfo("Card update submitted. If your bank needs verification, you’ll be returned here automatically.");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to update card");
    } finally {
      setBusy(false);
    }
  }

  // Handle redirects back from Stripe (3DS) for card updates
  useEffect(() => {
    if (!isLoaded || !user) return;
    const setupReturn = params.get("setupReturn");
    const siId = params.get("setup_intent") || params.get("si");
    if (!setupReturn || !siId) return;

    const key = `brilliem_setup_return_${siId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");

    (async () => {
      try {
        setBusy(true);
        setError(null);
        setInfo("Saving your new card…");
        await fetch("/api/stripe/payment-method/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setupIntentId: siId }),
        });

        setInfo("Payment method updated.");
        await fetchBillingInfo();
        // Clear query
        window.history.replaceState({}, "", "/dashboard/subscription");
      } catch {
        setError("Failed to save your new card. Please try again.");
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, isLoaded]);

  // ---------- Plan change confirmation modal ----------
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTier, setConfirmTier] = useState<Tier | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const planElementsRef = useRef<StripeElements | null>(null);
  const planCardElRef = useRef<StripeCardElement | null>(null);
  const planCardMountRef = useRef<HTMLDivElement | null>(null);

  function clearPlanCard() {
    try {
      planCardElRef.current?.unmount();
    } catch {}
    planElementsRef.current = null;
    planCardElRef.current = null;
  }

  async function mountPlanCardElement() {
    if (!confirmOpen) return;
    if (!preview?.requiresPaymentMethod) return;
    const mount = planCardMountRef.current;
    if (!mount) return;
    if (planCardElRef.current) return;

    const stripe = await ensureStripe();
    const elements = stripe.elements({
      appearance: { theme: "stripe" },
    });

    const card = elements.create("card", {
      hidePostalCode: false,
    });

    mount.innerHTML = "";
    card.mount(mount);

    planElementsRef.current = elements;
    planCardElRef.current = card;
  }

  async function openConfirm(tier: Tier) {
    if (!user) return;
    if (busy) return;

    setError(null);
    setInfo(null);
    setPreview(null);
    clearPlanCard();

    setConfirmTier(tier);
    setConfirmOpen(true);
    setPreviewLoading(true);

    try {
      // Preview breakdown
      const res = await fetch("/api/stripe/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tier === "none" ? "free" : tier, interval: billingInterval }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to load price breakdown");
      }

      const data = (await res.json()) as PreviewResponse;
      setPreview(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load breakdown");
    } finally {
      setPreviewLoading(false);
    }
  }

  function closeConfirm() {
    setConfirmOpen(false);
    setConfirmTier(null);
    setPreview(null);
    clearPlanCard();
  }

  async function refreshClerkTier(optimisticTier?: Tier) {
    if (!user) return;
    try {
      await user.reload();
      const reloaded = user;
      // local refresh for pending fields
      const pt = (reloaded?.unsafeMetadata?.pendingTier as Tier | undefined) || null;
      const pi = (reloaded?.unsafeMetadata?.pendingBillingInterval as BillingInterval | undefined) || null;
      const pe = (reloaded?.unsafeMetadata?.pendingTierEffective as number | undefined) || null;
      setPendingTier(pt);
      setPendingInterval(pi);
      setPendingEffective(pe);
    } catch {
      // ignore
    } finally {
      router.refresh();
    }
  }

  function hardRefreshSelf(query?: string) {
    const base = "/dashboard/subscription";
    const url = query ? `${base}?${query}` : base;
    window.location.assign(url);
  }

  async function finalizeActivation(payload: { subscriptionId: string; tier: PaidTier }) {
    const res = await fetch("/api/stripe/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(t || "Failed to activate subscription");
    }
  }

  async function executeConfirmedChange() {
    if (!confirmTier) return;
    if (!user) return;

    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      // FREE
      if (confirmTier === "free") {
        const res = await fetch("/api/stripe/change-tier", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier: "free" }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || "Failed to change plan");
        }

        const data = (await res.json()) as
          | { mode: "downgrade_scheduled"; effectiveDate: number }
          | { mode: "free_immediate" };

        if (data.mode === "downgrade_scheduled") {
          setPendingTier("free");
          setPendingEffective(data.effectiveDate);
          setInfo(`Switch to Free scheduled for ${formatDate(data.effectiveDate) || "your next renewal"}.`);
          await refreshClerkTier();
          closeConfirm();
          hardRefreshSelf("scheduled=1");
          return;
        }

        setPendingTier(null);
        setPendingEffective(null);
        setInfo("You’re now on the Free tier.");
        await refreshClerkTier("free");
        closeConfirm();
        hardRefreshSelf("success=1");
        return;
      }

      // PAID (signup OR paid->paid)
      const nextTier = confirmTier as PaidTier;

      const currentIsPaid = currentTier === "lessons" || currentTier === "lessons_ai";
      const nextIsPaid = nextTier === "lessons" || nextTier === "lessons_ai";

      // Paid -> Paid: use change-tier (upgrade immediate / downgrade scheduled)
      if (currentIsPaid && nextIsPaid) {
        const res = await fetch("/api/stripe/change-tier", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier: nextTier, interval: billingInterval }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || "Failed to change plan");
        }

        const data = (await res.json()) as
          | { mode: "upgraded"; subscriptionId: string; amountDue?: number; currency?: string }
          | { mode: "payment_required"; subscriptionId: string; clientSecret: string; amountDue?: number; currency?: string }
          | { mode: "downgrade_scheduled"; effectiveDate: number };

        if (data.mode === "downgrade_scheduled") {
          setPendingTier(nextTier);
          setPendingEffective(data.effectiveDate);
          setInfo(
            `Downgrade scheduled. You’ll switch on ${formatDate(data.effectiveDate) || "your next renewal date"}.`
          );
          await refreshClerkTier();
          closeConfirm();
          hardRefreshSelf("scheduled=1");
          return;
        }

        if (data.mode === "payment_required") {
          const stripe = await ensureStripe();
          const returnUrl = `${window.location.origin}/dashboard/subscription?paymentReturn=1&sid=${encodeURIComponent(
            data.subscriptionId
          )}&tier=${encodeURIComponent(nextTier)}`;

          const result = await stripe.confirmCardPayment(data.clientSecret, { return_url: returnUrl });

          if (result.error) throw new Error(result.error.message || "Payment failed");
          const status = result.paymentIntent?.status;
          if (status === "succeeded" || status === "processing") {
            // IMPORTANT:
            // For paid->paid upgrades, the change-tier API returns `payment_required` *before*
            // writing the new tier into Clerk. After payment succeeds, we must sync from Stripe.
            await finalizeActivation({ subscriptionId: data.subscriptionId, tier: nextTier }).catch(() => null);

            setPendingTier(null);
            setPendingEffective(null);
            setInfo("Payment successful! Your plan was upgraded.");
            await refreshClerkTier(nextTier);
            closeConfirm();
            hardRefreshSelf("success=1");
            return;
          }

          setInfo("Payment submitted. If your bank needs verification, you’ll be returned here automatically.");
          closeConfirm();
          return;
        }

        // upgraded (no extra action)
        // (safe to sync from Stripe anyway to guarantee Clerk metadata reflects the live subscription)
        await finalizeActivation({ subscriptionId: data.subscriptionId, tier: nextTier }).catch(() => null);

        setPendingTier(null);
        setPendingEffective(null);
        setInfo("Plan updated.");
        await refreshClerkTier(nextTier);
        closeConfirm();
        hardRefreshSelf("success=1");
        return;
      }

      // Signup / Free -> Paid: create subscription intent, confirm PI, activate
      const intentRes = await fetch("/api/stripe/subscription-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: nextTier, interval: billingInterval }),
      });

      if (!intentRes.ok) {
        const text = await intentRes.text().catch(() => "");
        throw new Error(text || "Failed to start subscription");
      }

      const intentData = (await intentRes.json()) as { subscriptionId: string; clientSecret: string };
      const stripe = await ensureStripe();

      const returnUrl = `${window.location.origin}/dashboard/subscription?paymentReturn=1&sid=${encodeURIComponent(
        intentData.subscriptionId
      )}&tier=${encodeURIComponent(nextTier)}`;

      // If they don't have a card on file, require CardElement input
      if (preview?.requiresPaymentMethod) {
        const cardEl = planCardElRef.current;
        if (!cardEl) throw new Error("Card form not ready");
        const result = await stripe.confirmCardPayment(intentData.clientSecret, {
          payment_method: { card: cardEl },
          return_url: returnUrl,
        });
        if (result.error) throw new Error(result.error.message || "Payment failed");
        const status = result.paymentIntent?.status;
        if (status === "succeeded" || status === "processing") {
          await finalizeActivation({ subscriptionId: intentData.subscriptionId, tier: nextTier });
          setPendingTier(null);
          setPendingEffective(null);
          setInfo("Payment successful! Your subscription is active.");
          await refreshClerkTier(nextTier);
          closeConfirm();
          hardRefreshSelf("success=1");
          return;
        }
      } else {
        // Use saved card on file; confirm handles 3DS if required
        const result = await stripe.confirmCardPayment(intentData.clientSecret, { return_url: returnUrl });
        if (result.error) throw new Error(result.error.message || "Payment failed");
        const status = result.paymentIntent?.status;
        if (status === "succeeded" || status === "processing") {
          await finalizeActivation({ subscriptionId: intentData.subscriptionId, tier: nextTier });
          setPendingTier(null);
          setPendingEffective(null);
          setInfo("Subscription activated.");
          await refreshClerkTier(nextTier);
          closeConfirm();
          hardRefreshSelf("success=1");
          return;
        }
      }

      setInfo("Payment submitted. If your bank needs verification, you’ll be returned here automatically.");
      closeConfirm();
    } catch (e: any) {
      setError(e?.message || "Failed to change plan");
    } finally {
      setBusy(false);
    }
  }

  // Handle return from Stripe PaymentIntent (3DS) for subscription signup/upgrade
  useEffect(() => {
    if (!isLoaded || !user) return;

    const paymentReturn = params.get("paymentReturn");
    const sid = params.get("sid");
    const t = params.get("tier") as PaidTier | null;
    if (!paymentReturn || !sid || !t) return;

    const key = `brilliem_payment_return_${sid}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");

    (async () => {
      try {
        setBusy(true);
        setError(null);
        setInfo("Finishing your payment…");

        // If this was a signup flow, activate in Clerk (safe to call even if already activated)
        await finalizeActivation({ subscriptionId: sid, tier: t }).catch(() => null);

        setPendingTier(null);
        setPendingEffective(null);
        await refreshClerkTier(t);

        setInfo("Payment completed.");
        await fetchBillingInfo();

        window.history.replaceState({}, "", "/dashboard/subscription");
      } catch {
        setError("Payment completed, but we couldn’t finalize your subscription. Please refresh and try again.");
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, isLoaded]);

  // Mount card elements when modals open
  useEffect(() => {
    if (!pmModalOpen) return;
    mountPmCardElement().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pmModalOpen, pmClientSecret]);

  useEffect(() => {
    if (!confirmOpen) return;
    mountPlanCardElement().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmOpen, preview?.requiresPaymentMethod]);

  // Initial fetch of billing info once user is loaded
  useEffect(() => {
    if (!isLoaded || !user) return;
    // Default the toggle to the user's current billing interval (if any)
    setBillingInterval(currentInterval);
    fetchBillingInfo().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  const pendingText = useMemo(() => {
    if (!pendingTier) return null;
    const d = formatDate(pendingEffective || null);
    if (pendingTier === "free") return `Pending: Free (effective ${d || "next billing period"})`;
    const int = pendingInterval ? ` ${intervalLabel(pendingInterval)}` : "";
    return `Pending: ${tierLabel(pendingTier)}${int} (effective ${d || "next billing period"})`;
  }, [pendingTier, pendingInterval, pendingEffective]);

  const nextPayText = useMemo(() => {
    if (!hasStripeCustomer) return null;
    if (cancelsAt) {
      return `Ends: ${formatDate(cancelsAt) || "at period end"}`;
    }
    if (!nextPaymentAt) return null;
    const date = formatDate(nextPaymentAt);
    if (!date) return null;

    if (typeof nextPaymentAmount === "number" && nextPaymentCurrency) {
      return `Next payment: ${date} (${formatMoney(nextPaymentAmount, nextPaymentCurrency)})`;
    }
    return `Next payment: ${date}`;
  }, [hasStripeCustomer, cancelsAt, nextPaymentAt, nextPaymentAmount, nextPaymentCurrency]);

  const tiers = useMemo(
    () => {
      const isYearly = billingInterval === "year";
      const lessonsPrice = isYearly ? "$120 / year" : "$15 / month";
      const lessonsAiPrice = isYearly ? "$240 / year" : "$30 / month";
      const lessonsSub = isYearly ? "($10/mo billed yearly)" : null;
      const lessonsAiSub = isYearly ? "($20/mo billed yearly)" : null;
      return [
      {
        id: "free" as const,
        title: "Free",
        price: "$0",
        subPrice: null as string | null,
        features: ["Browse the content", "Access the first lesson in every unit", "Access to the first assessment in every unit"],
        accent: "from-slate-700 to-slate-900",
      },
      {
        id: "lessons" as const,
        title: "Lessons",
        price: lessonsPrice,
        subPrice: lessonsSub,
        features: ["Unlimited access to all lessons", "Unlimited access to all assessments", "Infinite variations of each assessment"],
        accent: "from-indigo-500 to-fuchsia-500",
      },
      {
        id: "lessons_ai" as const,
        title: "Lessons + AI Tutor",
        price: lessonsAiPrice,
        subPrice: lessonsAiSub,
        features: ["Everything in the Lessons plan", "Step by step AI Tutor homework support by text or photo", "AI Lesson suggestion for homework help"],
        accent: "from-emerald-500 to-cyan-500",
      },
      ];
    },
    [billingInterval]
  );

  function isCurrent(t: Tier) {
    if (t === "none") return false;
    if (t === "free") return currentTier === "free";
    // Paid tiers must match BOTH tier + billing interval (monthly vs yearly).
    return currentTier === t && currentInterval === billingInterval;
  }

  function isScheduled(t: Tier) {
    if (!pendingTier) return false;
    if (t === "none") return false;
    if (pendingTier !== t) return false;
    if (t === "free") return true;
    // Scheduled changes are specific to an interval.
    if (pendingInterval) return pendingInterval === billingInterval;
    return true;
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Subscription</h1>
            <p className="mt-2 text-slate-600">A subscription for every needs</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
            <div>
              <span className="font-semibold text-slate-900">Current tier:</span> {tierLabel(currentTier)}{currentTier !== "none" && currentTier !== "free" ? ` (${intervalLabel(currentInterval)})` : ""}
            </div>
            {nextPayText && <div className="mt-1 text-xs text-slate-600">{nextPayText}</div>}
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
              Choose a tier to unlock content. We’ll show you a breakdown before anything changes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setBillingInterval("month")}
                disabled={busy}
                className={cx(
                  "rounded-xl px-4 py-2 text-sm font-semibold",
                  billingInterval === "month" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                )}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingInterval("year")}
                disabled={busy}
                className={cx(
                  "rounded-xl px-4 py-2 text-sm font-semibold",
                  billingInterval === "year" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                )}
              >
                Yearly
              </button>
            </div>

            {!canPay && (
              <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Missing Stripe publishable key
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {tiers.map((t) => {
            const disabled = busy || !canPay || isCurrent(t.id) || isScheduled(t.id);
            return (
              <div key={t.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-base font-bold text-slate-900">{t.title}</div>
                  {isCurrent(t.id) && (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                      Current
                    </span>
                  )}
                  {!isCurrent(t.id) && isScheduled(t.id) && (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                      Scheduled
                    </span>
                  )}
                </div>

                <div className="mt-1 text-sm text-slate-700">{t.price}</div>
                {t.subPrice && <div className="mt-1 text-xs text-slate-500">{t.subPrice}</div>}

                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                  {t.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-slate-400" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  disabled={disabled}
                  onClick={() => openConfirm(t.id)}
                  className={cx(
                    "mt-5 w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition",
                    disabled ? "bg-slate-300" : `bg-gradient-to-r ${t.accent} hover:brightness-110`
                  )}
                >
                  {isCurrent(t.id) ? "Selected" : isScheduled(t.id) ? "Scheduled" : "Change to this plan"}
                </button>

                {(currentTier === "lessons_ai" || currentTier === "lessons") && (t.id === "free" || t.id === "lessons") && (
                  <div className="mt-2 text-xs text-slate-500">Downgrades take effect next billing period.</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment method section */}
      {hasStripeCustomer && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Payment method</h2>
              <p className="mt-1 text-sm text-slate-600">This card will be used for subscription payments.</p>
            </div>

            <button
              onClick={beginUpdateCard}
              disabled={busy || !canPay}
              className={cx(
                "rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition",
                busy || !canPay ? "bg-slate-300" : "bg-slate-900 hover:bg-slate-800"
              )}
            >
              Update card
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            {savedCard ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">
                    {savedCard.brand.toUpperCase()} •••• {savedCard.last4}
                  </div>
                  <div className="text-xs text-slate-600">
                    Expires {String(savedCard.expMonth).padStart(2, "0")}/{String(savedCard.expYear).slice(-2)}
                  </div>
                </div>
                <div className="text-xs text-slate-600">Charges happen automatically.</div>
              </div>
            ) : (
              <div>No saved card found.</div>
            )}
          </div>
        </div>
      )}

      {/* Confirm plan modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-bold text-slate-900">Confirm plan change</div>
                <div className="mt-1 text-sm text-slate-600">
                  {confirmTier ? (
                    <>
                      You’re switching to{" "}
                      <span className="font-semibold text-slate-900">
                        {tierLabel(confirmTier)}
                        {preview && confirmTier !== "free" ? ` (${intervalLabel(preview.desiredInterval)})` : ""}
                      </span>
                      .
                    </>
                  ) : (
                    "Loading…"
                  )}
                </div>
              </div>

              <button
                onClick={closeConfirm}
                disabled={busy}
                className={cx(
                  "rounded-xl px-3 py-1.5 text-sm font-semibold",
                  busy ? "text-slate-400" : "text-slate-700 hover:bg-slate-100"
                )}
              >
                Close
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {previewLoading && <div className="text-sm text-slate-600">Loading breakdown…</div>}

              {!previewLoading && preview && (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <div className="text-sm font-semibold text-slate-900">Payment breakdown</div>

                    <div className="rounded-xl border border-slate-200 bg-white">
                      <div className="max-h-48 overflow-auto p-3 text-sm text-slate-700">
                        {preview.lines.length === 0 ? (
                          <div className="text-slate-600">No line items</div>
                        ) : (
                          <ul className="space-y-2">
                            {preview.lines.map((l, idx) => (
                              <li key={idx} className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate">{l.description}</div>
                                  {l.periodStart && l.periodEnd && (
                                    <div className="mt-0.5 text-xs text-slate-500">
                                      {formatDate(l.periodStart) || ""} – {formatDate(l.periodEnd) || ""}
                                    </div>
                                  )}
                                </div>
                                <div className={cx("shrink-0 font-semibold", l.amount < 0 && "text-emerald-700")}>
                                  {l.amount < 0 ? "-" : ""}
                                  {formatMoney(Math.abs(l.amount), l.currency)}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="border-t border-slate-200 bg-slate-50 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-slate-900">Due now</div>
                          <div className="font-bold text-slate-900">{formatMoney(preview.dueNow, preview.currency)}</div>
                        </div>

                        {preview.action === "downgrade" || preview.action === "cancel_to_free" ? (
                          <div className="mt-2 text-xs text-slate-600">
                            No charge today. Your current plan stays active until{" "}
                            <span className="font-semibold text-slate-900">
                              {formatDate(preview.effectiveAt || preview.nextPaymentAt) || "your next renewal"}
                            </span>
                            .
                          </div>
                        ) : (
                          <div className="mt-2 text-xs text-slate-600">
                            Next payment:{" "}
                            <span className="font-semibold text-slate-900">
                              {formatDate(preview.nextPaymentAt) || "next billing date"}
                            </span>{" "}
                            ({formatMoney(preview.nextAmount, preview.currency)})
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card on file / card entry */}
                  {confirmTier !== "free" && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold text-slate-900">How you’ll pay</div>

                      {!preview.requiresPaymentMethod && (preview.paymentMethod || savedCard) ? (
                        <div className="mt-2 text-sm text-slate-700">
                          We’ll charge{" "}
                          <span className="font-semibold text-slate-900">
                            {(preview.paymentMethod?.brand || savedCard?.brand || "Card").toUpperCase()} ••••{" "}
                            {preview.paymentMethod?.last4 || savedCard?.last4}
                          </span>
                          .
                        </div>
                      ) : (
                        <div className="mt-2 text-sm text-slate-700">Enter your card details to pay.</div>
                      )}

                      {preview.requiresPaymentMethod && (
                        <div className="mt-3">
                          <div ref={planCardMountRef} className="rounded-xl border border-slate-200 bg-white p-3" />
                          <div className="mt-2 text-xs text-slate-500">
                            Your card will be saved for future payments.
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button
                onClick={closeConfirm}
                disabled={busy}
                className={cx(
                  "rounded-2xl px-4 py-2 text-sm font-semibold",
                  busy ? "text-slate-400" : "text-slate-700 hover:bg-slate-100"
                )}
              >
                Cancel
              </button>

              <button
                onClick={executeConfirmedChange}
                disabled={busy || previewLoading || !preview}
                className={cx(
                  "rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition",
                  busy || previewLoading || !preview ? "bg-slate-300" : "bg-slate-900 hover:bg-slate-800"
                )}
              >
                {busy
                  ? "Processing…"
                  : confirmTier === "free"
                    ? "Confirm"
                    : preview?.requiresPaymentMethod
                      ? "Confirm & Pay"
                      : "Confirm"}
              </button>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Some banks require an extra verification step (3D Secure). If so, you’ll be returned here automatically.
            </div>
          </div>
        </div>
      )}

      {/* Update card modal */}
      {pmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-bold text-slate-900">Update your card</div>
                <div className="mt-1 text-sm text-slate-600">This will update the card used for subscription payments.</div>
              </div>
              <button
                onClick={clearPmState}
                disabled={busy}
                className={cx(
                  "rounded-xl px-3 py-1.5 text-sm font-semibold",
                  busy ? "text-slate-400" : "text-slate-700 hover:bg-slate-100"
                )}
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              <div ref={pmCardMountRef} className="rounded-xl border border-slate-200 bg-white p-3" />
            </div>

            <button
              onClick={confirmUpdateCard}
              disabled={busy || !pmClientSecret}
              className={cx(
                "mt-5 w-full rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition",
                busy || !pmClientSecret ? "bg-slate-300" : "bg-slate-900 hover:bg-slate-800"
              )}
            >
              {busy ? "Saving…" : "Save card"}
            </button>

            <div className="mt-2 text-xs text-slate-500">
              Some banks require an extra verification step (3D Secure). If so, you’ll be brought back here automatically.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
