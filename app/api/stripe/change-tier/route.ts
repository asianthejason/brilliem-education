import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

type Tier = "free" | "lessons" | "lessons_ai";

function getPriceIdForTier(tier: Exclude<Tier, "free">) {
  // Support multiple env var names (your repo already uses STRIPE_PRICE_LESSONS_AI_TUTOR in subscription-intent).
  const lessons =
    process.env.STRIPE_PRICE_LESSONS ||
    process.env.STRIPE_LESSONS_PRICE_ID ||
    process.env.LESSONS_PRICE_ID;

  const lessonsAi =
    process.env.STRIPE_PRICE_LESSONS_AI_TUTOR || // preferred (matches your subscription-intent route)
    process.env.STRIPE_PRICE_LESSONS_AI ||       // supported fallback
    process.env.STRIPE_LESSONS_AI_PRICE_ID ||
    process.env.LESSONS_AI_PRICE_ID;

  if (tier === "lessons") return lessons;
  return lessonsAi;
}

function rank(tier: Tier) {
  if (tier === "lessons_ai") return 2;
  if (tier === "lessons") return 1;
  return 0;
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

  const currentTier = (meta.tier as Tier | undefined) || "free";
  const subId = meta.stripeSubscriptionId as string | undefined;
  const customerId = meta.stripeCustomerId as string | undefined;

  // If no subscription exists yet, only "free" can be applied here.
  // Upgrades from Free should still use your existing subscription-intent flow.
  if (!subId) {
    if (desired === "free") {
      const nextUnsafe: Record<string, any> = {
        ...meta,
        tier: "free",
        pendingTier: undefined,
        pendingTierEffective: undefined,
        stripeSubscriptionStatus: "free",
      };
      Object.keys(nextUnsafe).forEach((k) => nextUnsafe[k] === undefined && delete nextUnsafe[k]);
      await client.users.updateUser(userId, { unsafeMetadata: nextUnsafe });
      return Response.json({ mode: "free_immediate" });
    }

    return new Response("No active subscription to change. Use subscription-intent for upgrades from Free.", {
      status: 409,
    });
  }

  // Load subscription (and invoice PI for upgrades)
  const subscription = await stripe.subscriptions.retrieve(subId, {
    expand: ["latest_invoice.payment_intent"],
  });

  // Ownership checks (defense-in-depth)
  const metaClerkUserId = subscription.metadata?.clerkUserId;
  if (metaClerkUserId && metaClerkUserId !== userId) return new Response("Forbidden", { status: 403 });
  if (customerId && subscription.customer && subscription.customer !== customerId) return new Response("Forbidden", { status: 403 });

  // Selecting "free" => wait until end of current period (user keeps access through paid period)
  if (desired === "free") {
    const updated = await stripe.subscriptions.update(subId, {
      cancel_at_period_end: true,
    });

    const nextUnsafe: Record<string, any> = {
      ...meta,
      tier: currentTier, // keep current tier until renewal
      pendingTier: "free",
      pendingTierEffective: updated.current_period_end,
      stripeSubscriptionStatus: updated.status,
      stripeSubscriptionId: updated.id,
      stripeCustomerId: updated.customer,
    };
    Object.keys(nextUnsafe).forEach((k) => nextUnsafe[k] === undefined && delete nextUnsafe[k]);
    await client.users.updateUser(userId, { unsafeMetadata: nextUnsafe });

    return Response.json({ mode: "downgrade_scheduled", effectiveDate: updated.current_period_end });
  }

  // If we had a prior schedule, release it so the new request wins.
  if (subscription.schedule) {
    try {
      await stripe.subscriptionSchedules.release(String(subscription.schedule));
    } catch {
      // ignore
    }
  }

  // Paid -> paid only (your client already enforces this)
  if (currentTier === "free") {
    return new Response("Current tier is Free. Use subscription-intent for upgrades from Free.", { status: 409 });
  }

  const desiredRank = rank(desired);
  const currentRank = rank(currentTier);

  const item = subscription.items.data[0];
  if (!item?.id) return new Response("Subscription item missing", { status: 500 });

  const nextPriceId = getPriceIdForTier(desired);
  if (!nextPriceId) {
    return new Response("Missing Stripe price id env var for desired tier", { status: 500 });
  }

  // DOWNGRADE: schedule for next billing period (no proration)
  if (desiredRank < currentRank) {
    const sched = await stripe.subscriptionSchedules.create({
      from_subscription: subId,
      end_behavior: "release",
    });

    await stripe.subscriptionSchedules.update(sched.id, {
      phases: [
        {
          items: [{ price: String(item.price.id), quantity: item.quantity ?? 1 }],
          start_date: "now",
          end_date: subscription.current_period_end,
        },
        {
          items: [{ price: nextPriceId, quantity: item.quantity ?? 1 }],
          start_date: subscription.current_period_end,
        },
      ],
    });

    const nextUnsafe: Record<string, any> = {
      ...meta,
      tier: currentTier, // keep access until renewal
      pendingTier: desired,
      pendingTierEffective: subscription.current_period_end,
      stripeSubscriptionStatus: subscription.status,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer,
    };
    Object.keys(nextUnsafe).forEach((k) => nextUnsafe[k] === undefined && delete nextUnsafe[k]);
    await client.users.updateUser(userId, { unsafeMetadata: nextUnsafe });

    return Response.json({ mode: "downgrade_scheduled", effectiveDate: subscription.current_period_end });
  }

  // UPGRADE: immediate with proration
  const upgraded = await stripe.subscriptions.update(subId, {
    cancel_at_period_end: false,
    items: [{ id: item.id, price: nextPriceId }],
    proration_behavior: "create_prorations",
    billing_cycle_anchor: "unchanged",
    payment_behavior: "default_incomplete",
    expand: ["latest_invoice.payment_intent"],
  });

  const latestInvoice = upgraded.latest_invoice as any | null;
  const pi = latestInvoice?.payment_intent as any | null;

  // If Stripe needs payment / 3DS, return client_secret for your Payment Element flow
  if (pi?.client_secret && pi?.status && pi.status !== "succeeded") {
    return Response.json({
      mode: "payment_required",
      subscriptionId: upgraded.id,
      clientSecret: String(pi.client_secret),
      amountDue: typeof latestInvoice?.amount_due === "number" ? latestInvoice.amount_due : undefined,
      currency: latestInvoice?.currency ? String(latestInvoice.currency) : undefined,
    });
  }

  // Auto-paid or $0 proration => update Clerk immediately
  const nextUnsafe: Record<string, any> = {
    ...meta,
    tier: desired,
    pendingTier: undefined,
    pendingTierEffective: undefined,
    stripeSubscriptionId: upgraded.id,
    stripeSubscriptionStatus: upgraded.status,
    stripeCustomerId: upgraded.customer,
  };
  Object.keys(nextUnsafe).forEach((k) => nextUnsafe[k] === undefined && delete nextUnsafe[k]);
  await client.users.updateUser(userId, { unsafeMetadata: nextUnsafe });

  return Response.json({
    mode: "upgraded",
    amountDue: typeof latestInvoice?.amount_due === "number" ? latestInvoice.amount_due : undefined,
    currency: latestInvoice?.currency ? String(latestInvoice.currency) : undefined,
  });
}
