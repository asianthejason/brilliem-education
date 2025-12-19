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

  const { tier, paymentMethodId } = (await req.json()) as {
    tier?: string;
    paymentMethodId?: string;
  };

  const price = priceForTier(tier || "");
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

  const existingCustomerId = (user.privateMetadata as any)?.stripeCustomerId as string | undefined;

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
      } as any,
    });
  }

  // Attach the PaymentMethod and set as default for invoices.
  // If already attached, Stripe will throw; we can safely ignore that case.
  try {
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  } catch (e: any) {
    const code = e?.code as string | undefined;
    const msg = (e?.message as string | undefined) || "";
    const alreadyAttached =
      code === "resource_already_exists" ||
      msg.toLowerCase().includes("already") ||
      msg.toLowerCase().includes("attached");
    if (!alreadyAttached) throw e;
  }

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  // Create subscription (incomplete until payment is confirmed on the client)
  const sub = await stripe.subscriptions.create(
    {
      customer: customerId,
      items: [{ price: (price as string).trim() }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      metadata: { clerkUserId: userId, tier: tier || "" },
    },
    // helps reduce duplicate subs if the user double-clicks
    { idempotencyKey: `sub-intent:${userId}:${tier}:${paymentMethodId}` }
  );

  const pi = (sub.latest_invoice as any)?.payment_intent;
  const clientSecret = pi?.client_secret as string | undefined;
  if (!clientSecret) return new Response("Missing payment intent client secret", { status: 500 });

  return Response.json({
    subscriptionId: sub.id,
    clientSecret,
  });
}
