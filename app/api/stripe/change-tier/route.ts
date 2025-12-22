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

  try {
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
  let subscription = await stripe.subscriptions.retrieve(subId, {
    expand: ["latest_invoice.payment_intent", "schedule"],
  });

  function getScheduleIdFromSubscription(sub: any): string | null {
    const s = sub?.schedule;
    if (!s) return null;
    if (typeof s === "string") return s;
    if (typeof s === "object" && s.id) return String(s.id);
    return null;
  }

  // Defense-in-depth ownership check
  const metaClerkUserId = subscription.metadata?.clerkUserId;
  if (metaClerkUserId && metaClerkUserId !== userId) return new Response("Forbidden", { status: 403 });

  const item = subscription.items.data[0];
  if (!item?.id || !item.price?.id) return new Response("Subscription item missing", { status: 500 });
  const quantity = item.quantity ?? 1;

  // Selecting Free = cancel at period end (keep access)
  if (desired === "free") {
    // If a subscription schedule exists (e.g. from a previously scheduled downgrade),
    // release it first so the schedule no longer controls future changes.
    // Then we can cleanly set cancel_at_period_end.
    const scheduleId = getScheduleIdFromSubscription(subscription);
    if (scheduleId) {
      try {
        await stripe.subscriptionSchedules.release(scheduleId);
      } catch {
        // Ignore: schedule may already be released/canceled.
      }
    }

    const updated = await stripe.subscriptions.update(subId, { cancel_at_period_end: true });

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
    // Re-fetch so `cancel_at_period_end` / schedule state is current for the rest of the handler.
    subscription = await stripe.subscriptions.retrieve(subId, {
      expand: ["latest_invoice.payment_intent", "schedule"],
    });
  }

  // If a schedule exists and we're doing an immediate change (upgrade/lateral),
  // release the schedule first. Otherwise Stripe may block direct subscription updates.
  const existingScheduleId = getScheduleIdFromSubscription(subscription);
  if (existingScheduleId && rank(desired) >= rank(currentTier)) {
    try {
      await stripe.subscriptionSchedules.release(existingScheduleId);
      // Re-fetch so schedule is detached before we do direct subscription updates.
      subscription = await stripe.subscriptions.retrieve(subId, {
        expand: ["latest_invoice.payment_intent", "schedule"],
      });
    } catch {
      // Ignore
    }
  }

  // If there is an existing schedule, we will re-use it; otherwise create one.
  // IMPORTANT: When using from_subscription, you cannot set end_behavior at creation.
  async function getOrCreateScheduleIdForDowngrade(): Promise<string> {
    const existingId = getScheduleIdFromSubscription(subscription);
    if (existingId) {
      try {
        const sch = await stripe.subscriptionSchedules.retrieve(existingId);
        if (sch?.status === "active" || sch?.status === "not_started") return sch.id;
      } catch {
        // Fall through to create.
      }
    }
    const created = await stripe.subscriptionSchedules.create({ from_subscription: subId });
    return created.id;
  }

  const desiredRank = rank(desired);
  const currentRank = rank(currentTier);

  const nextPriceId = priceIdForTier(desired as Exclude<Tier, "free">);
  if (!nextPriceId) return new Response("Missing Stripe price id env var for desired tier", { status: 500 });

  // DOWNGRADE: schedule for next billing period, keep current access until then
  if (desiredRank < currentRank) {
    const scheduleId = await getOrCreateScheduleIdForDowngrade();
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
  });

  // IMPORTANT: `subscription.update` creates proration adjustments as *pending invoice items*.
  // If we do nothing, Stripe will add those prorations to the *next* renewal invoice.
  // To charge the prorated difference immediately, we create/finalize/pay an invoice right now.
  let invoice = await stripe.invoices.create({
    customer: String(updated.customer),
    subscription: updated.id,
    auto_advance: false,
  });

  // Finalize so it can be paid.
  if (invoice.status === "draft") {
    invoice = await stripe.invoices.finalizeInvoice(String(invoice.id), {
      expand: ["payment_intent"],
    });
  } else {
    invoice = await stripe.invoices.retrieve(String(invoice.id), { expand: ["payment_intent"] });
  }

  const amountDue = typeof invoice.amount_due === "number" ? invoice.amount_due : 0;
  const currency = invoice.currency ? String(invoice.currency) : undefined;

  // If there is money due, attempt to pay now (uses the default PM; may require SCA).
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
  } catch (err: any) {
    const msg =
      err?.raw?.message ||
      err?.message ||
      "Failed to change plan";
    // Surface a helpful message to the client (your UI shows this text).
    return new Response(msg, { status: 400 });
  }
}
