import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { subscriptionId, tier } = (await req.json()) as {
    subscriptionId?: string;
    tier?: "free" | "lessons" | "lessons_ai";
  };

  if (!subscriptionId || !tier) {
    return new Response("Missing subscriptionId or tier", { status: 400 });
  }

  // Optional sanity check: ensure subscription exists and is in a paid/activating state.
  // If you rely on webhooks for final state, you can loosen this.
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  if (!sub) return new Response("Subscription not found", { status: 404 });

  // After a successful first payment, Stripe will typically move to 'active' (or 'trialing').
  // In some cases it can briefly remain 'incomplete' right after confirmCardPayment.
  const okStatuses = new Set(["active", "trialing", "incomplete"]);
  if (!okStatuses.has(sub.status)) {
    return new Response(`Subscription status not valid: ${sub.status}`, { status: 400 });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  await client.users.updateUser(userId, {
    unsafeMetadata: {
      ...(user.unsafeMetadata as any),
      tier,
      stripeSubscriptionId: subscriptionId,
    },
  });

  return Response.json({ ok: true });
}
