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
 * This keeps the user on your /get-started page (no redirect to Stripe Checkout).
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { tier } = (await req.json()) as { tier?: Tier };
  if (!tier) return new Response("Missing tier", { status: 400 });

  const price = priceForTier(tier);
  if (!price) return new Response("Missing Stripe price env var for tier", { status: 500 });

  // Guardrail: Stripe subscriptions require a Price ID (price_...), not a Product ID (prod_...).
  if (typeof price !== "string" || !price.trim().startsWith("price_")) {
    return new Response(
      "Stripe price misconfigured. Set STRIPE_PRICE_LESSONS / STRIPE_PRICE_LESSONS_AI_TUTOR to a Price ID that starts with price_.",
      { status: 500 }
    );
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const existing = (user.unsafeMetadata ?? {}) as Record<string, unknown>;
  let customerId = (existing.stripeCustomerId as string | undefined) || undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.emailAddresses?.[0]?.emailAddress || undefined,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
      metadata: { clerkUserId: userId },
    });
    customerId = customer.id;

    await client.users.updateUser(userId, {
      unsafeMetadata: {
        ...existing,
        stripeCustomerId: customerId,
      },
    });
  }

  // Idempotency helps prevent duplicate subscriptions if the user double-clicks.
  const idempotencyKey = `sub-intent:${userId}:${tier}`;

  const sub = await stripe.subscriptions.create(
    {
      customer: customerId,
      items: [{ price: (price as string).trim() }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
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
