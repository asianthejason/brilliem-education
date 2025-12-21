import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

type Tier = "lessons" | "lessons_ai";

const priceForTier = (tier: Tier) => {
  if (tier === "lessons") return process.env.STRIPE_PRICE_LESSONS;
  return process.env.STRIPE_PRICE_LESSONS_AI_TUTOR;
};

/**
 * Creates a Stripe Subscription in `default_incomplete` state and returns the
 * PaymentIntent client_secret so the client can confirm payment using the Payment Element.
 *
 * This keeps the user on your /dashboard page (no Stripe Checkout redirect).
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => null)) as { tier?: Tier } | null;
  const tier = body?.tier;

  if (tier !== "lessons" && tier !== "lessons_ai") {
    return new Response("Invalid tier", { status: 400 });
  }

  const priceId = priceForTier(tier);
  if (!priceId) {
    return new Response("Missing Stripe price id env var", { status: 500 });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const meta = (user.unsafeMetadata || {}) as Record<string, any>;

  const email = user.emailAddresses?.[0]?.emailAddress;
  let customerId = (meta.stripeCustomerId as string | undefined) || undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: email || undefined,
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || undefined,
      metadata: { clerkUserId: userId },
    });
    customerId = customer.id;

    await client.users.updateUser(userId, {
      unsafeMetadata: { ...meta, stripeCustomerId: customerId },
    });
  }

  // Create a new subscription intent. If you later want upgrades/downgrades,
  // you can add an "update subscription" endpoint.
  const idempotencyKey = `sub_intent_${userId}_${tier}_${Date.now()}`;

  const sub = await stripe.subscriptions.create(
    {
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      metadata: { clerkUserId: userId, tier },
    },
    { idempotencyKey }
  );

  const pi = (sub.latest_invoice as any)?.payment_intent;
  const clientSecret = pi?.client_secret as string | undefined;
  if (!clientSecret) return new Response("Missing payment intent client secret", { status: 500 });

  return Response.json({
    subscriptionId: sub.id,
    clientSecret,
  });
}
