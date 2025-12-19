import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

type Tier = "free" | "lessons" | "lessons_ai";

const priceForTier = (tier: Tier) => {
  if (tier === "lessons") return process.env.STRIPE_PRICE_LESSONS;
  if (tier === "lessons_ai") return process.env.STRIPE_PRICE_LESSONS_AI_TUTOR;
  return null;
};

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json()) as { tier?: Tier };
  const tier = body.tier;
  if (!tier || tier === "free") return new Response("Invalid tier", { status: 400 });

  const price = priceForTier(tier);
  if (!price) return new Response("Missing Stripe price env var for tier", { status: 500 });

  const origin =
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

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

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: userId,
    line_items: [{ price: (price as string).trim(), quantity: 1 }],
    success_url: `${origin}/get-started?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/get-started?canceled=1`,
    metadata: { clerkUserId: userId, tier },
  });

  return Response.json({ url: session.url });
}
