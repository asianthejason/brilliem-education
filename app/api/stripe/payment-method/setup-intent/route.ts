import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

/**
 * Creates a SetupIntent for the current Stripe customer so the user can update
 * their saved card (default payment method) from your app.
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const meta = (user.unsafeMetadata || {}) as Record<string, any>;

  const customerId = meta.stripeCustomerId as string | undefined;
  if (!customerId) {
    // Per your rules: users who have never entered a card (Free tier only) won't have a Stripe customer.
    return new Response("No Stripe customer for this user", { status: 400 });
  }

  const idempotencyKey = `setup_intent_${userId}_${Date.now()}`;

  const si = await stripe.setupIntents.create(
    {
      customer: customerId,
      // Payment Element will automatically pick appropriate payment method types.
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: { clerkUserId: userId },
    },
    { idempotencyKey }
  );

  if (!si.client_secret) return new Response("Missing setup intent client secret", { status: 500 });

  return Response.json({ setupIntentId: si.id, clientSecret: si.client_secret });
}
