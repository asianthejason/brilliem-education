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

  // Attach the PaymentMethod and set as default for invoices
  await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  // Create subscription (incomplete until payment confirmed)
  const sub = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price }],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.payment_intent"],
    metadata: { clerkUserId: userId, tier: tier || "" },
  });

  const pi = (sub.latest_invoice as any)?.payment_intent;
  const clientSecret = pi?.client_secret as string | undefined;
  if (!clientSecret) return new Response("Missing payment intent client secret", { status: 500 });

  return Response.json({
    subscriptionId: sub.id,
    clientSecret,
  });
}
