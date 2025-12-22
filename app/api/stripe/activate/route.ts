import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

type Tier = "free" | "lessons" | "lessons_ai";

/**
 * After the client confirms payment for a subscription (or proration invoice),
 * this route marks the user as active in Clerk AND ensures Stripe has a default
 * payment method saved for future prorations/upgrades.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { subscriptionId?: string; tier?: Tier }
    | null;

  const subscriptionId = body?.subscriptionId;
  const tier = body?.tier;

  if (!subscriptionId || !tier) {
    return new Response("Missing subscriptionId or tier", { status: 400 });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const meta = (user.unsafeMetadata || {}) as Record<string, any>;

  // Expand invoice payment intent so we can extract the payment_method that was used.
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["latest_invoice.payment_intent", "default_payment_method", "customer"],
  });

  // Defense-in-depth: only allow activating subscriptions that belong to this Clerk user.
  const metaClerkUserId = (sub as any)?.metadata?.clerkUserId as string | undefined;
  if (metaClerkUserId && metaClerkUserId !== userId) {
    return new Response("Forbidden", { status: 403 });
  }

  const customerId = typeof sub.customer === "string" ? sub.customer : (sub.customer as any)?.id;

  // Try to set a default payment method for future proration invoices / upgrades.
  // This fixes the "upgrade didn't auto-charge" issue when Stripe has no default PM.
  const latestInvoice: any = sub.latest_invoice || null;
  const pi: any = latestInvoice?.payment_intent || null;

  const paymentMethodId =
    (pi?.payment_method && String(pi.payment_method)) ||
    (typeof (sub as any).default_payment_method === "string"
      ? (sub as any).default_payment_method
      : (sub as any).default_payment_method?.id) ||
    null;

  if (customerId && paymentMethodId) {
    // Set default on customer invoices
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // Set default on subscription as well (helps some proration flows)
    await stripe.subscriptions.update(subscriptionId, {
      default_payment_method: paymentMethodId,
      cancel_at_period_end: false,
    });
  }

  const nextUnsafe: Record<string, any> = {
    ...meta,
    tier,
    pendingTier: undefined,
    pendingTierEffective: undefined,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripeSubscriptionStatus: sub.status,
  };

  // Remove undefined keys so Clerk doesn't store "undefined"
  Object.keys(nextUnsafe).forEach((k) => nextUnsafe[k] === undefined && delete nextUnsafe[k]);

  await client.users.updateUser(userId, { unsafeMetadata: nextUnsafe });

  return Response.json({ ok: true });
}
