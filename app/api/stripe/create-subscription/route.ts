import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

const priceForTier = (tier: string) => {
  if (tier === "lessons") return process.env.STRIPE_PRICE_LESSONS;
  if (tier === "lessons_ai") return process.env.STRIPE_PRICE_LESSONS_AI_TUTOR;
  return null;
};

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { tier, paymentMethodId } = await req.json();

  const price = priceForTier(tier);
  if (!price) return new Response("Invalid tier", { status: 400 });

  // Guardrail: Stripe subscriptions require a Price ID (price_...), not a Product ID (prod_...).
  if (typeof price !== "string" || !price.trim().startsWith("price_")) {
    return new Response(
      "Stripe price misconfigured. Set STRIPE_PRICE_LESSONS / STRIPE_PRICE_LESSONS_AI_TUTOR to a Price ID that starts with price_.",
      { status: 500 }
    );
  }
  if (!paymentMethodId) return new Response("Missing paymentMethodId", { status: 400 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const existingCustomerId =
    (user.privateMetadata?.stripeCustomerId as string | undefined) ?? null;

  const customerId =
    existingCustomerId ||
    (
      await stripe.customers.create({
        email: user.emailAddresses?.[0]?.emailAddress,
        name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || undefined,
        metadata: { clerkUserId: userId },
      })
    ).id;

  if (!existingCustomerId) {
    await client.users.updateUser(userId, {
      privateMetadata: {
        ...(user.privateMetadata || {}),
        stripeCustomerId: customerId,
      },
    });
  }

  // Attach PM and set as default
  await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  // Create subscription (incomplete until payment confirmed)
  const sub = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: (price as string).trim() }],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.payment_intent"],
    metadata: { clerkUserId: userId, tier },
  });

  const pi = (sub.latest_invoice as any)?.payment_intent;
  const clientSecret = pi?.client_secret as string | undefined;
  if (!clientSecret) return new Response("Missing payment intent client secret", { status: 500 });

  return Response.json({
    subscriptionId: sub.id,
    clientSecret,
  });
}
