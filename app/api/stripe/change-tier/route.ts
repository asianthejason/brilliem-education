import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

type Tier = "free" | "lessons" | "lessons_ai";

function rank(t: Tier) {
  if (t === "lessons_ai") return 2;
  if (t === "lessons") return 1;
  return 0;
}

function priceIdForTier(tier: Exclude<Tier, "free">) {
  const lessons =
    process.env.STRIPE_PRICE_LESSONS ||
    process.env.STRIPE_LESSONS_PRICE_ID ||
    process.env.LESSONS_PRICE_ID;

  const lessonsAi =
    process.env.STRIPE_PRICE_LESSONS_AI_TUTOR || // matches your subscription-intent route
    process.env.STRIPE_PRICE_LESSONS_AI ||
    process.env.STRIPE_LESSONS_AI_PRICE_ID ||
    process.env.LESSONS_AI_PRICE_ID;

  return tier === "lessons" ? lessons : lessonsAi;
}

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

  const body = (await req.json().catch(() => null)) as { tier?: Tier } | null;
  const desired = body?.tier;
  if (!desired) return new Response("Missing tier", { status: 400 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const meta = (user.unsafeMetadata || {}) as Record<string, any>;

  const currentTier = ((meta.tier as Tier | undefined) || "free") as Tier;
  const subId = meta.stripeSubscriptionId as string | undefined;

  // If no Stripe subscription exists yet, only allow Free here.
  if (!subId) {
    if (desired === "free") {
      await updateClerk(userId, {
        tier: "free",
        pendingTier: undefined,
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
    expand: ["latest_invoice.payment_intent", "schedule"],
  });

  // Defense-in-depth ownership check
  const metaClerkUserId = subscription.metadata?.clerkUserId;
  if (metaClerkUserId && metaClerkUserId !== userId) return new Response("Forbidden", { status: 403 });

  const item = subscription.items.data[0];
  if (!item?.id || !item.price?.id) return new Response("Subscription item missing", { status: 500 });
  const quantity = item.quantity ?? 1;

  // Selecting Free = cancel at period end (keep access)
  if (desired === "free") {
    const updated = await stripe.subscriptions.update(subId, {
      cancel_at_period_end: true,
    });

    await updateClerk(userId, {
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

  // If there is an existing schedule, we will re-use it; otherwise create one.
  // IMPORTANT: When using from_subscription, you cannot set end_behavior at creation.
  async function getOrCreateScheduleId(): Promise<string> {
    const existing = subscription.schedule ? String(subscription.schedule) : null;
    if (existing) return existing;

    const created = await stripe.subscriptionSchedules.create({
      from_subscription: subId,
    });
    return created.id;
  }

  const desiredRank = rank(desired);
  const currentRank = rank(currentTier);

  const nextPriceId = priceIdForTier(desired as Exclude<Tier, "free">);
  if (!nextPriceId) return new Response("Missing Stripe price id env var for desired tier", { status: 500 });

  // DOWNGRADE: schedule for next billing period, keep current access until then
  if (desiredRank < currentRank) {
    const scheduleId = await getOrCreateScheduleId();
    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);

    // Keep the current phase start date EXACTLY as Stripe set it, or Stripe will error:
    // "You can not modify the start date of the current phase."
    const currentPhaseStart = schedule.phases?.[0]?.start_date;
    if (!currentPhaseStart) return new Response("Subscription schedule has no current phase", { status: 500 });

    const periodEnd = subscription.current_period_end;

    await stripe.subscriptionSchedules.update(scheduleId, {
      end_behavior: "release",
      phases: [
        {
          items: [{ price: String(item.price.id), quantity }],
          start_date: currentPhaseStart,
          end_date: periodEnd,
        },
        {
          items: [{ price: nextPriceId, quantity }],
          start_date: periodEnd,
        },
      ],
    });

    await updateClerk(userId, {
      tier: currentTier,
      pendingTier: desired,
      pendingTierEffective: periodEnd,
      stripeSubscriptionStatus: subscription.status,
      stripeCustomerId: subscription.customer,
      stripeSubscriptionId: subscription.id,
    });

    return Response.json({ mode: "downgrade_scheduled", effectiveDate: periodEnd });
  }

  // Lateral change or upgrade: apply immediately with proration.
  // To CHARGE the proration immediately (instead of adding to next invoice),
  // we create/pay the proration invoice right away.
  const updated = await stripe.subscriptions.update(subId, {
    cancel_at_period_end: false,
    items: [{ id: item.id, price: nextPriceId }],
    proration_behavior: "create_prorations",
    billing_cycle_anchor: "unchanged",
    payment_behavior: "default_incomplete",
    expand: ["latest_invoice.payment_intent"],
  });

  // Try to pay any proration invoice immediately (so user sees payment flow if required).
  let invoice: any = updated.latest_invoice || null;

  // If Stripe didn't generate an invoice immediately, force one for pending prorations.
  if (!invoice) {
    invoice = await stripe.invoices.create({
      customer: String(updated.customer),
      subscription: updated.id,
      auto_advance: true,
    });
  }

  // Ensure invoice is finalized so it can be paid.
  if (invoice.status === "draft") {
    invoice = await stripe.invoices.finalizeInvoice(String(invoice.id), {
      expand: ["payment_intent"],
    });
  } else {
    invoice = await stripe.invoices.retrieve(String(invoice.id), { expand: ["payment_intent"] });
  }

  const amountDue = typeof invoice.amount_due === "number" ? invoice.amount_due : 0;
  const currency = invoice.currency ? String(invoice.currency) : undefined;
  const pi = invoice.payment_intent as any | null;

  // If there is money due, attempt to pay now (this will use default PM; may require action).
  if (amountDue > 0) {
    // If no payment intent exists yet, pay() will create/attach one.
    if (!pi) {
      invoice = await stripe.invoices.pay(String(invoice.id), { expand: ["payment_intent"] });
    }

    const pi2 = (invoice.payment_intent as any | null) || pi;

    if (pi2?.client_secret && pi2?.status && pi2.status !== "succeeded") {
      return Response.json({
        mode: "payment_required",
        subscriptionId: updated.id,
        clientSecret: String(pi2.client_secret),
        amountDue,
        currency,
      });
    }
  }

  // Success: update Clerk immediately
  await updateClerk(userId, {
    tier: desired,
    pendingTier: undefined,
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
