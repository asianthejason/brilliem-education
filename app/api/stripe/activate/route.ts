import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

type Tier = "free" | "lessons" | "lessons_ai";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { subscriptionId?: string; tier?: Tier }
    | null;

  const subscriptionId = body?.subscriptionId;
  const tier = body?.tier;

  if (!subscriptionId || (tier !== "lessons" && tier !== "lessons_ai" && tier !== "free")) {
    return new Response("Invalid request", { status: 400 });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const meta = (user.unsafeMetadata || {}) as Record<string, any>;

  const sub = await stripe.subscriptions.retrieve(subscriptionId);

  if (sub.metadata?.clerkUserId !== userId) {
    return new Response("Forbidden", { status: 403 });
  }

  if (sub.status !== "active" && sub.status !== "trialing") {
    return new Response(`Subscription not active (status: ${sub.status})`, { status: 400 });
  }

  // Cancel any previous subscription we were tracking to avoid double charges.
  const previousSubId = meta.stripeSubscriptionId as string | undefined;
  if (previousSubId && previousSubId !== subscriptionId) {
    try {
      await stripe.subscriptions.cancel(previousSubId);
    } catch {
      // non-fatal
    }
  }

  const nextUnsafe: Record<string, any> = {
    ...meta,
    tier,
    stripeCustomerId: sub.customer as string,
    stripeSubscriptionId: subscriptionId,
    stripeSubscriptionStatus: sub.status,
  };

  await client.users.updateUser(userId, { unsafeMetadata: nextUnsafe });

  return Response.json({ ok: true });
}
