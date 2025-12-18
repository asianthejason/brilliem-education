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

  const { tier } = await req.json();
  const price = priceForTier(tier);
  if (!price) return new Response("Invalid tier", { status: 400 });

  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) return new Response("Missing NEXT_PUBLIC_APP_URL", { status: 500 });

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

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: userId,
    line_items: [{ price, quantity: 1 }],
    success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/get-started?canceled=1`,
  });

  return Response.json({ url: session.url });
}
