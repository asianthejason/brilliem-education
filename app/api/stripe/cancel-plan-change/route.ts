import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import { intervalFromPriceRecurring, tierFromPriceId, type BillingInterval, type Tier } from "@/lib/stripePlans";

async function updateClerk(userId: string, patch: Record<string, any>) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const meta = (user.unsafeMetadata || {}) as Record<string, any>;
  const nextUnsafe: Record<string, any> = { ...meta, ...patch };
  Object.keys(nextUnsafe).forEach((k) => nextUnsafe[k] === undefined && delete nextUnsafe[k]);
  await client.users.updateUser(userId, { unsafeMetadata: nextUnsafe });
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const clerkUserId: string = userId;

  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  const meta = (user.unsafeMetadata || {}) as Record<string, any>;

  const subId = meta.stripeSubscriptionId as string | undefined;
  if (!subId) return new Response("No subscription to update", { status: 409 });

  const retrieveSub = async () =>
    await stripe.subscriptions.retrieve(subId, {
      expand: ["schedule", "items.data.price"],
    });

  const scheduleIdFromSubscription = (sub: any): string | null => {
    const s = sub?.schedule;
    if (!s) return null;
    return typeof s === "string" ? s : s.id;
  };

  let subscription: any = await retrieveSub();

  // Defense-in-depth ownership check
  const metaClerkUserId = subscription.metadata?.clerkUserId;
  if (metaClerkUserId && metaClerkUserId !== clerkUserId) return new Response("Forbidden", { status: 403 });

  // Cancel scheduled plan change (subscription schedule)
  const scheduleId = scheduleIdFromSubscription(subscription);
  if (scheduleId) {
    await stripe.subscriptionSchedules.release(scheduleId, { preserve_cancel_date: false });
  }

  // Cancel scheduled cancellation (Free at period end)
  if (subscription.cancel_at_period_end) {
    await stripe.subscriptions.update(subId, { cancel_at_period_end: false });
  }

  // Reload to get the live state post-release
  subscription = await retrieveSub();

  const item = subscription.items?.data?.[0];
  const price = item?.price as any;
  const priceId = price?.id ? String(price.id) : null;
  const nextTier = tierFromPriceId(priceId) as Tier;
  const nextInterval: BillingInterval = intervalFromPriceRecurring(price?.recurring || null);

  await updateClerk(clerkUserId, {
    tier: nextTier,
    billingInterval: nextInterval,
    pendingTier: undefined,
    pendingBillingInterval: undefined,
    pendingTierEffective: undefined,
    stripeSubscriptionStatus: subscription.status,
    stripeCustomerId: subscription.customer,
    stripeSubscriptionId: subscription.id,
  });

  return Response.json({ ok: true, tier: nextTier, interval: nextInterval });
}
