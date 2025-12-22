import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

type Tier = "free" | "lessons" | "lessons_ai";

function getPriceIdForTier(tier: Exclude<Tier, "free">) {
  // Keep compatibility with the env vars already used elsewhere in your repo.
  const lessons =
    process.env.STRIPE_PRICE_LESSONS ||
    process.env.STRIPE_LESSONS_PRICE_ID ||
    process.env.LESSONS_PRICE_ID;

  const lessonsAi =
    process.env.STRIPE_PRICE_LESSONS_AI_TUTOR || // preferred (matches subscription-intent/create-subscription)
    process.env.STRIPE_PRICE_LESSONS_AI || // fallback
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

async function clearPendingAndUncancelIfNeeded(subId: string) {
  // If the subscription was set to cancel at period end (e.g. user previously clicked "Free"),
  // Stripe will refuse certain plan-change operations (like creating a schedule).
  // We must first "uncancel" it and release any schedule.
  const sub = await stripe.subscriptions.retrieve(subId);

  if (sub.cancel_at_period_end) {
    await stripe.subscriptions.update(subId, { cancel_at_period_end: false });
  }

  if (sub.schedule) {
    try {
      await stripe.subscriptionSchedules.release(String(sub.schedule));
    } catch {
      // ignore
    }
  }
}

function stringifyStripeError(err: any) {
  const msg =
    err?.raw?.message ||
    err?.message ||
    err?.toString?.() ||
    "Unknown error";

  const code = err?.code ? ` (${err.code})` : "";
  const type = err?.type ? ` ${err.type}` : "";
  return `${msg}${code}${type}`.trim();
}

export async function POST(req: Request) {
  try {
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

    // No subscription on record
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

    // If the user is selecting a paid tier, make sure the subscription isn't "pending cancel"
    // and clear any previous schedule so changes can apply.
    if (desired !== "free") {
      await clearPendingAndUncancelIfNeeded(subId);
    }

    // Reload subscription (and invoice PI for upgrades)
    const subscription = await stripe.subscriptions.retrieve(subId, {
      expand: ["latest_invoice.payment_intent"],
    });

    // Ownership checks (defense-in-depth)
    const metaClerkUserId = subscription.metadata?.clerkUserId;
    if (metaClerkUserId && metaClerkUserId !== userId) return new Response("Forbidden", { status: 403 });
    if (customerId && subscription.customer && subscription.customer !== customerId) {
      return new Response("Forbidden", { status: 403 });
    }

    // Selecting "free" => cancel at period end (user keeps access through paid period)
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

    // Paid -> paid only (upgrades from Free still go through subscription-intent)
    if (currentTier === "free") {
      return new Response("Current tier is Free. Use subscription-intent for upgrades from Free.", { status: 409 });
    }

    const desiredRank = rank(desired);
    const currentRank = rank(currentTier);

    const item = subscription.items.data[0];
    if (!item?.id) return new Response("Subscription item missing", { status: 500 });

    const nextPriceId = getPriceIdForTier(desired);
    if (!nextPriceId) {
      return new Response(
        "Missing Stripe price id env var for desired tier. Expected STRIPE_PRICE_LESSONS and STRIPE_PRICE_LESSONS_AI_TUTOR.",
        { status: 500 }
      );
    }

    // DOWNGRADE: schedule for next billing period (no proration).
    if (desiredRank < currentRank) {
      // Safety: schedule creation fails if cancel_at_period_end=true.
      if (subscription.cancel_at_period_end) {
        await stripe.subscriptions.update(subId, { cancel_at_period_end: false });
      }

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

    // UPGRADE: immediate with proration.
    // Note: If the customer already has a payment method on file, Stripe may auto-pay the prorated invoice
    // without prompting the user again. If 3DS/action is needed, we return a client_secret for the Payment Element.
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

    if (pi?.client_secret && pi?.status && pi.status !== "succeeded") {
      // Client will confirm payment, then call /api/stripe/activate to update tier in Clerk.
      return Response.json({
        mode: "payment_required",
        subscriptionId: upgraded.id,
        clientSecret: String(pi.client_secret),
        amountDue: typeof latestInvoice?.amount_due === "number" ? latestInvoice.amount_due : undefined,
        currency: latestInvoice?.currency ? String(latestInvoice.currency) : undefined,
      });
    }

    // Auto-paid or $0 proration => update Clerk immediately.
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
  } catch (err: any) {
    // Make errors visible to the client (so your UI doesn't just show "Failed to change plan").
    const msg = stringifyStripeError(err);
    console.error("[change-tier] error:", err);
    return new Response(msg, { status: 400 });
  }
}
