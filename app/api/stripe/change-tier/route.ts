import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import { intervalFromPriceRecurring, priceIdFor, type BillingInterval, type Tier } from "@/lib/stripePlans";

async function updateClerk(userId: string, patch: Record<string, any>) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const meta = (user.unsafeMetadata || {}) as Record<string, any>;
  const nextUnsafe: Record<string, any> = { ...meta, ...patch };
  Object.keys(nextUnsafe).forEach((k) => nextUnsafe[k] === undefined && delete nextUnsafe[k]);
  await client.users.updateUser(userId, { unsafeMetadata: nextUnsafe });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  // NOTE: TypeScript does not reliably carry outer-scope narrowing into nested helper functions.
  // Copy to a new constant so helpers see a definite string.
  const clerkUserId: string = userId;

  const body = (await req.json().catch(() => null)) as { tier?: Tier; interval?: BillingInterval } | null;
  const desired = body?.tier;
  const desiredInterval: BillingInterval = body?.interval === "year" ? "year" : "month";
  if (!desired) return new Response("Missing tier", { status: 400 });

  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  const meta = (user.unsafeMetadata || {}) as Record<string, any>;

  const currentTier = ((meta.tier as Tier | undefined) || "free") as Tier;
  const subId = meta.stripeSubscriptionId as string | undefined;

  // If no Stripe subscription exists yet, only allow Free here.
  if (!subId) {
    if (desired === "free") {
      await updateClerk(clerkUserId, {
        tier: "free",
        billingInterval: "month",
        pendingTier: undefined,
        pendingBillingInterval: undefined,
        pendingTierEffective: undefined,
        stripeSubscriptionStatus: "free",
      });
      return Response.json({ mode: "free_immediate" });
    }
    return new Response("No active subscription to change. Use subscription-intent for upgrades from Free.", {
      status: 409,
    });
  }

  // Fetch subscription (with schedule + invoice info)
  const subscription = await stripe.subscriptions.retrieve(subId, {
    expand: ["latest_invoice.payment_intent", "schedule", "items.data.price"],
  });

  // Defense-in-depth ownership check
  const metaClerkUserId = subscription.metadata?.clerkUserId;
  if (metaClerkUserId && metaClerkUserId !== clerkUserId) return new Response("Forbidden", { status: 403 });

  const item = subscription.items.data[0];
  if (!item?.id || !item.price?.id) return new Response("Subscription item missing", { status: 500 });
  const quantity = item.quantity ?? 1;

  const currentSubInterval = intervalFromPriceRecurring((item.price as any)?.recurring || null);
  const currentUnit = typeof (item.price as any)?.unit_amount === "number" ? ((item.price as any).unit_amount as number) : 0;

  // Selecting Free = cancel at period end (keep access)
  if (desired === "free") {
    const updated = await stripe.subscriptions.update(subId, {
      cancel_at_period_end: true,
    });

    await updateClerk(clerkUserId, {
      tier: currentTier,
      pendingTier: "free",
      pendingTierEffective: updated.current_period_end,
      stripeSubscriptionStatus: updated.status,
      stripeCustomerId: updated.customer,
      stripeSubscriptionId: updated.id,
    });

    return Response.json({ mode: "downgrade_scheduled", effectiveDate: updated.current_period_end });
  }

  // Any paid-tier change should "uncancel" first if the user had scheduled Free.
  if (subscription.cancel_at_period_end) {
    await stripe.subscriptions.update(subId, { cancel_at_period_end: false });
  }

  // If there is an existing schedule, re-use it; otherwise create one.
  async function getOrCreateScheduleId(): Promise<string> {
    const existing = subscription.schedule ? String(subscription.schedule) : null;
    if (existing) return existing;
    const created = await stripe.subscriptionSchedules.create({ from_subscription: subId });
    return created.id;
  }

  const nextPriceId = priceIdFor(desired as Exclude<Tier, "free">, desiredInterval);
  if (!nextPriceId) return new Response("Missing Stripe price id env var for desired tier", { status: 500 });

  const desiredPrice = (await stripe.prices.retrieve(nextPriceId)) as any;
  const desiredStripeInterval = intervalFromPriceRecurring(desiredPrice?.recurring || null);
  const desiredUnit = typeof desiredPrice?.unit_amount === "number" ? (desiredPrice.unit_amount as number) : 0;

  const sameInterval = currentSubInterval === desiredStripeInterval;
  const intervalChanged = !sameInterval;

  // CRITICAL RULE:
  // Same-interval downgrades (cheaper plan) must NOT prorate and must be scheduled for period end.
  // Stripe can generate tiny positive prorations for downgrades; we ignore them in this case.
  const forceScheduledDowngrade = sameInterval && desiredUnit > 0 && desiredUnit < currentUnit;

  // Helper to schedule a change for period end (no proration)
  async function scheduleForPeriodEnd() {
    const scheduleId = await getOrCreateScheduleId();
    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);

    const currentPhaseStart = schedule.phases?.[0]?.start_date;
    if (!currentPhaseStart) throw new Error("Subscription schedule has no current phase");

    const periodEnd = subscription.current_period_end;

    await stripe.subscriptionSchedules.update(scheduleId, {
      end_behavior: "release",
      phases: [
        {
          items: [{ price: String((item.price as any).id), quantity }],
          start_date: currentPhaseStart,
          end_date: periodEnd,
        },
        {
          items: [{ price: nextPriceId, quantity }],
          start_date: periodEnd,
        },
      ],
    });

    await updateClerk(clerkUserId, {
      tier: currentTier,
      billingInterval: currentSubInterval,
      pendingTier: desired,
      pendingBillingInterval: desiredStripeInterval,
      pendingTierEffective: periodEnd,
      stripeSubscriptionStatus: subscription.status,
      stripeCustomerId: subscription.customer,
      stripeSubscriptionId: subscription.id,
    });

    return Response.json({ mode: "downgrade_scheduled", effectiveDate: periodEnd });
  }

  if (forceScheduledDowngrade) {
    return await scheduleForPeriodEnd();
  }

  // For other changes, decide upgrade vs scheduled change by whether there is money due NOW.
  const anchorForImmediate = intervalChanged ? "now" : "unchanged";

  const upcoming = await stripe.invoices.retrieveUpcoming({
    customer: String(subscription.customer),
    subscription: subId,
    subscription_items: [{ id: item.id, price: nextPriceId }],
    subscription_proration_behavior: "create_prorations",
    subscription_billing_cycle_anchor: anchorForImmediate,
  } as any);

  const dueNow = Math.max(0, (upcoming.amount_due ?? 0) as number);

  // Scheduled change (no money due now)
  if (dueNow <= 0) {
    return await scheduleForPeriodEnd();
  }

  // UPGRADE: apply immediately with proration.
  const updated = await stripe.subscriptions.update(subId, {
    cancel_at_period_end: false,
    items: [{ id: item.id, price: nextPriceId }],
    proration_behavior: "create_prorations",
    billing_cycle_anchor: anchorForImmediate,
  });

  // Charge prorations immediately by creating/finalizing/paying an invoice now.
  let invoice = await stripe.invoices.create({
    customer: String(updated.customer),
    subscription: updated.id,
    auto_advance: false,
  });

  if (invoice.status === "draft") {
    invoice = await stripe.invoices.finalizeInvoice(String(invoice.id), {
      expand: ["payment_intent"],
    });
  } else {
    invoice = await stripe.invoices.retrieve(String(invoice.id), { expand: ["payment_intent"] });
  }

  const amountDue = typeof invoice.amount_due === "number" ? invoice.amount_due : 0;
  const currency = invoice.currency ? String(invoice.currency) : undefined;

  if (amountDue > 0) {
    invoice = await stripe.invoices.pay(String(invoice.id), { expand: ["payment_intent"] });

    const pi = invoice.payment_intent as any | null;
    if (pi?.client_secret && pi?.status && pi.status !== "succeeded") {
      return Response.json({
        mode: "payment_required",
        subscriptionId: updated.id,
        clientSecret: String(pi.client_secret),
        amountDue,
        currency,
      });
    }
  }

    await updateClerk(clerkUserId, {
    tier: desired,
    billingInterval: desiredStripeInterval,
    pendingTier: undefined,
    pendingBillingInterval: undefined,
    pendingTierEffective: undefined,
    stripeSubscriptionId: updated.id,
    stripeCustomerId: updated.customer,
    stripeSubscriptionStatus: updated.status,
  });

  return Response.json({
    mode: "upgraded",
    amountDue: amountDue > 0 ? amountDue : undefined,
    currency,
  });
}
