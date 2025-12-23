import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

type Tier = "lessons" | "lessons_ai";

function priceForTier(tier: Tier) {
  const lessons =
    process.env.STRIPE_PRICE_LESSONS ||
    process.env.STRIPE_LESSONS_PRICE_ID ||
    process.env.LESSONS_PRICE_ID;

  const lessonsAi =
    process.env.STRIPE_PRICE_LESSONS_AI_TUTOR ||
    process.env.STRIPE_PRICE_LESSONS_AI ||
    process.env.STRIPE_LESSONS_AI_TUTOR_PRICE_ID ||
    process.env.LESSONS_AI_TUTOR_PRICE_ID;

  if (tier === "lessons") return lessons;
  return lessonsAi;
}

/**
 * Creates a Stripe Subscription in `default_incomplete` state and returns the
 * PaymentIntent client_secret so the client can confirm payment.
 *
 * We restrict to cards only (no Klarna) and save the card as the customer's default.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => null)) as { tier?: Tier } | null;
  const tier = body?.tier;
  if (!tier) return new Response("Missing tier", { status: 400 });

  const priceId = priceForTier(tier);
  if (!priceId) return new Response("Missing Stripe price id env var", { status: 500 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const meta = (user.unsafeMetadata || {}) as Record<string, any>;

  let customerId = meta.stripeCustomerId as string | undefined;

  // Create Stripe customer if needed
  if (!customerId) {
    const created = await stripe.customers.create({
      email: user.emailAddresses?.[0]?.emailAddress,
      metadata: { clerkUserId: userId },
    });
    customerId = created.id;

    await client.users.updateUser(userId, {
      unsafeMetadata: { ...meta, stripeCustomerId: customerId },
    });
  }

  const idempotencyKey = `sub_intent_${userId}_${tier}_${Date.now()}`;

  const sub = await stripe.subscriptions.create(
    {
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      // Card only + save default payment method for future off-session charges.
      payment_settings: {
        payment_method_types: ["card"],
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

  return Response.json({ subscriptionId: sub.id, clientSecret });
}
