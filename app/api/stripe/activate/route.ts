import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import { intervalFromPriceRecurring, tierFromPriceId, type BillingInterval, type Tier } from "@/lib/stripePlans";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { subscriptionId?: string; tier?: Tier; interval?: BillingInterval }
    | null;

  const subscriptionId = body?.subscriptionId;
  if (!subscriptionId) return new Response("Missing subscriptionId", { status: 400 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const meta = (user.unsafeMetadata || {}) as Record<string, any>;

  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["latest_invoice.payment_intent"],
  });

  const priceId = (sub.items.data?.[0]?.price?.id as string | undefined) || null;
  const derivedTier: Tier = tierFromPriceId(priceId);
  const derivedInterval: BillingInterval = intervalFromPriceRecurring((sub.items.data?.[0]?.price as any)?.recurring);

  if (sub.metadata?.clerkUserId !== userId) {
    return new Response("Forbidden", { status: 403 });
  }

  if (sub.status !== "active" && sub.status !== "trialing") {
    return new Response(`Subscription not active (status: ${sub.status})`, { status: 400 });
  }

  // Cancel any previous subscription we were tracking to avoid double charges.
  const previousSubId = meta.stripeSubscriptionId as string | undefined;
  if (previousSubId && previousSubId !== subscriptionId) {
    try {
      await stripe.subscriptions.cancel(previousSubId);
    } catch {
      // non-fatal
    }
  }

  // Ensure the payment method used becomes the default, so proration upgrades can auto-pay.
  try {
    const pi = (sub.latest_invoice as any)?.payment_intent as any | null;
    const pm = pi?.payment_method as string | undefined;
    if (pm) {
      await stripe.customers.update(String(sub.customer), {
        invoice_settings: { default_payment_method: pm },
      });
      await stripe.subscriptions.update(sub.id, {
        default_payment_method: pm,
      });
    }
  } catch {
    // non-fatal
  }

  const nextUnsafe: Record<string, any> = {
    ...meta,
    tier: derivedTier,
    billingInterval: derivedInterval,
    pendingTier: undefined,
    pendingBillingInterval: undefined,
    pendingTierEffective: undefined,
    stripeCustomerId: sub.customer as string,
    stripeSubscriptionId: subscriptionId,
    stripeSubscriptionStatus: sub.status,
  };

  await client.users.updateUser(userId, { unsafeMetadata: nextUnsafe });

  return Response.json({ ok: true });
}
