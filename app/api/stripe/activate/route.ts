import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

type Tier = "free" | "lessons" | "lessons_ai";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { subscriptionId, tier } = (await req.json()) as {
    subscriptionId?: string;
    tier?: Tier;
  };

  if (!subscriptionId || !tier) {
    return new Response("Missing subscriptionId or tier", { status: 400 });
  }

  // Safety check: make sure this subscription belongs to the current Clerk user.
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  if (sub.metadata?.clerkUserId && sub.metadata.clerkUserId !== userId) {
    return new Response("Subscription does not belong to this user", { status: 403 });
  }

  // Most subscriptions should be active after successful confirmation.
  // (Some payment methods can be 'trialing' or 'past_due' briefly.)
  const okStatuses = new Set(["active", "trialing"]);
  if (!okStatuses.has(sub.status)) {
    return new Response(`Subscription not active (status: ${sub.status})`, { status: 400 });
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
