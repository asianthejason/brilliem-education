import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import {
  intervalFromPriceRecurring,
  priceIdFor,
  type BillingInterval,
  type Tier,
} from "@/lib/stripePlans";

function summarizeCard(pm: any) {
  const card = pm?.card;
  if (!card) return null;
  return {
    brand: card.brand as string,
    last4: card.last4 as string,
    expMonth: card.exp_month as number,
    expYear: card.exp_year as number,
  };
}

function addIntervalSeconds(nowSec: number, interval: string, count: number) {
  const day = 24 * 60 * 60;
  if (interval === "day") return nowSec + count * day;
  if (interval === "week") return nowSec + count * 7 * day;
  // For preview only; Stripe computes exact boundaries.
  if (interval === "month") return nowSec + count * 30 * day;
  if (interval === "year") return nowSec + count * 365 * day;
  return nowSec + 30 * day;
}

function tierLabel(t: Tier) {
  return t === "lessons" ? "Lessons" : t === "lessons_ai_tutor" ? "Lessons + AI Tutor" : "Free";
}

function intervalLabel(i: BillingInterval) {
  return i === "year" ? "Yearly" : "Monthly";
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => null)) as { tier?: Tier; interval?: BillingInterval } | null;
  const desired = body?.tier;
  const desiredInterval: BillingInterval = body?.interval === "year" ? "year" : "month";
  if (!desired) return new Response("Missing tier", { status: 400 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const meta = (user.unsafeMetadata || {}) as Record<string, any>;

  const currentTier = (meta.tier as Tier | undefined) || "free";
  const customerId = meta.stripeCustomerId as string | undefined;
  const subscriptionId = meta.stripeSubscriptionId as string | undefined;

  // Payment method summary (if any)
  let paymentMethod: any = null;
  if (customerId) {
    try {
      const cust = (await stripe.customers.retrieve(customerId, {
        expand: ["invoice_settings.default_payment_method"],
      })) as any;
      paymentMethod = summarizeCard(cust?.invoice_settings?.default_payment_method);
    } catch {
      paymentMethod = null;
    }
  }

  const base = {
    currentTier,
    desiredTier: desired,
    currentInterval: (meta.billingInterval as BillingInterval | undefined) || "month",
    desiredInterval,
    hasCustomer: !!customerId,
    hasPaymentMethod: !!paymentMethod,
    paymentMethod,
    currency: "cad" as string,
    dueNow: 0,
    nextAmount: 0,
    nextPaymentAt: null as number | null,
    effectiveAt: null as number | null,
    lines: [] as Array<{
      description: string;
      amount: number;
      currency: string;
      proration: boolean;
      periodStart?: number;
      periodEnd?: number;
    }>,
    action: "none" as
      | "none"
      | "signup"
      | "upgrade"
      | "downgrade"
      | "cancel_to_free"
      | "switch_to_free_immediate",
    requiresPaymentMethod: false,
  };

  // No Stripe subscription yet
  if (!subscriptionId) {
    if (desired === "free") {
      return Response.json({
        ...base,
        action: currentTier === "free" ? "none" : "switch_to_free_immediate",
        dueNow: 0,
        nextAmount: 0,
        nextPaymentAt: null,
        lines: [{ description: "Free plan", amount: 0, currency: "cad", proration: false }],
      });
    }

    const priceId = priceIdFor(desired, desiredInterval);
    if (!priceId) return new Response("Missing Stripe price id env var", { status: 500 });

    const price = await stripe.prices.retrieve(priceId);
    const unit = price.unit_amount ?? 0;
    const currency = price.currency || "cad";
    const interval = price.recurring?.interval || "month";
    const intervalCount = price.recurring?.interval_count || 1;

    const nowSec = Math.floor(Date.now() / 1000);
    const nextPaymentAt = addIntervalSeconds(nowSec, interval, intervalCount);

    return Response.json({
      ...base,
      action: "signup",
      currency,
      dueNow: unit,
      nextAmount: unit,
      nextPaymentAt,
      requiresPaymentMethod: !paymentMethod,
      lines: [
        {
          description: `First ${intervalLabel(desiredInterval)}: ${tierLabel(desired)}`,
          amount: unit,
          currency,
          proration: false,
        },
      ],
    });
  }

  // We have a Stripe subscription: preview change
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price", "schedule"],
  });

  const subCustomer = String(sub.customer);
  const currencyFromSub = sub.currency || "cad";
  const currentPeriodEnd = sub.current_period_end as number;

  // Switch to Free = cancel at period end
  if (desired === "free") {
    return Response.json({
      ...base,
      currency: currencyFromSub,
      action: "cancel_to_free",
      dueNow: 0,
      nextAmount: 0,
      nextPaymentAt: null,
      effectiveAt: currentPeriodEnd,
      lines: [
        {
          description: "No charge today",
          amount: 0,
          currency: currencyFromSub,
          proration: false,
          periodStart: sub.current_period_start as number,
          periodEnd: currentPeriodEnd,
        },
      ],
    });
  }

  const desiredPriceId = priceIdFor(desired, desiredInterval);
  if (!desiredPriceId) return new Response("Missing Stripe price id env var", { status: 500 });

  const item = sub.items.data[0];
  if (!item) return new Response("Subscription has no items", { status: 400 });

  const currentPrice = item.price as any;
  const currentUnit = (currentPrice?.unit_amount ?? 0) as number;
  const currentStripeInterval = intervalFromPriceRecurring(currentPrice?.recurring || null);

  const desiredPrice = (await stripe.prices.retrieve(desiredPriceId)) as any;
  const desiredUnit = (desiredPrice?.unit_amount ?? 0) as number;
  const desiredStripeInterval = intervalFromPriceRecurring(desiredPrice?.recurring || null);

  base.currentInterval = currentStripeInterval;
  base.desiredInterval = desiredStripeInterval;

  const intervalChanged = currentStripeInterval !== desiredStripeInterval;

  // Same-interval downgrades should NOT prorate and should be scheduled.
  // Interval changes are decided by Stripe's amount_due preview (because the user may owe money now).
  const isSameIntervalDowngrade = !intervalChanged && desiredUnit < currentUnit;

  if (isSameIntervalDowngrade) {
    const interval = desiredPrice.recurring?.interval || "month";
    const intervalCount = desiredPrice.recurring?.interval_count || 1;
    const nextPeriodEnd = addIntervalSeconds(currentPeriodEnd, interval, intervalCount);

    return Response.json({
      ...base,
      currency: desiredPrice.currency || currencyFromSub,
      action: "downgrade",
      dueNow: 0,
      nextAmount: desiredUnit,
      nextPaymentAt: currentPeriodEnd,
      effectiveAt: currentPeriodEnd,
      requiresPaymentMethod: false,
      lines: [
        {
          description: "No charge today (change scheduled for next billing period)",
          amount: 0,
          currency: desiredPrice.currency || currencyFromSub,
          proration: false,
          periodStart: sub.current_period_start as number,
          periodEnd: currentPeriodEnd,
        },
        {
          description: `1 × ${tierLabel(desired)} (${intervalLabel(desiredStripeInterval)})`,
          amount: desiredUnit,
          currency: desiredPrice.currency || currencyFromSub,
          proration: false,
          periodStart: currentPeriodEnd,
          periodEnd: nextPeriodEnd,
        },
      ],
    });
  }

  const anchorForImmediate = intervalChanged ? "now" : "unchanged";

  const upcoming = await stripe.invoices.retrieveUpcoming({
    customer: subCustomer,
    subscription: sub.id,
    subscription_items: [{ id: item.id, price: desiredPriceId }],
    subscription_proration_behavior: "create_prorations",
    subscription_billing_cycle_anchor: anchorForImmediate,
  } as any);

  const currency = upcoming.currency || currencyFromSub;
  const lines = (upcoming.lines?.data || []).map((l: any) => ({
    description: (l.description as string) || "Line item",
    amount: l.amount as number,
    currency: (l.currency as string) || currency,
    proration: !!l.proration,
    periodStart: l.period?.start as number | undefined,
    periodEnd: l.period?.end as number | undefined,
  }));

  const dueNow = Math.max(0, (upcoming.amount_due ?? 0) as number);

  const nowSec = Math.floor(Date.now() / 1000);
  const nextPaymentAt = intervalChanged
    ? addIntervalSeconds(nowSec, desiredPrice.recurring?.interval || "month", desiredPrice.recurring?.interval_count || 1)
    : currentPeriodEnd;

  // Interval-changed downgrades (possible if amount_due is 0) should be scheduled (no proration on our side).
  if (dueNow <= 0) {
    const interval = desiredPrice.recurring?.interval || "month";
    const intervalCount = desiredPrice.recurring?.interval_count || 1;
    const nextPeriodEnd = addIntervalSeconds(currentPeriodEnd, interval, intervalCount);

    return Response.json({
      ...base,
      currency: desiredPrice.currency || currencyFromSub,
      action: "downgrade",
      dueNow: 0,
      nextAmount: desiredUnit,
      nextPaymentAt: currentPeriodEnd,
      effectiveAt: currentPeriodEnd,
      requiresPaymentMethod: false,
      lines: [
        {
          description: "No charge today (change scheduled for next billing period)",
          amount: 0,
          currency: desiredPrice.currency || currencyFromSub,
          proration: false,
          periodStart: sub.current_period_start as number,
          periodEnd: currentPeriodEnd,
        },
        {
          description: `1 × ${tierLabel(desired)} (${intervalLabel(desiredStripeInterval)})`,
          amount: desiredUnit,
          currency: desiredPrice.currency || currencyFromSub,
          proration: false,
          periodStart: currentPeriodEnd,
          periodEnd: nextPeriodEnd,
        },
      ],
    });
  }

  return Response.json({
    ...base,
    currency,
    action: "upgrade",
    dueNow,
    nextAmount: 0,
    nextPaymentAt,
    effectiveAt: null,
    requiresPaymentMethod: !paymentMethod,
    lines,
  });
}
