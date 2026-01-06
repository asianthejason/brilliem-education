import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

type Tier = "free";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => null)) as { tier?: Tier } | null;
  if (body?.tier !== "free") return new Response("Invalid tier", { status: 400 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const meta = (user.unsafeMetadata || {}) as Record<string, any>;

  const currentSubId = meta.stripeSubscriptionId as string | undefined;
  const currentCustomerId = meta.stripeCustomerId as string | undefined;

  // If the user has an active Stripe subscription tracked, cancel it in Stripe.
  if (currentSubId) {
    try {
      const sub = await stripe.subscriptions.retrieve(currentSubId);

      // Basic ownership check to prevent canceling someone else's subscription.
      const metaClerkUserId = sub.metadata?.clerkUserId;
      if (metaClerkUserId && metaClerkUserId !== userId) {
        return new Response("Forbidden", { status: 403 });
      }
      if (currentCustomerId && sub.customer && sub.customer !== currentCustomerId) {
        return new Response("Forbidden", { status: 403 });
      }

      // Cancel immediately so Free tier takes effect right away.
      // (If you prefer end-of-period downgrades, change this to
      //  stripe.subscriptions.update(currentSubId, { cancel_at_period_end: true }))
      if (sub.status !== "canceled") {
        await stripe.subscriptions.cancel(currentSubId);
      }
    } catch (e: any) {
      // If Stripe says the subscription doesn't exist (or was already canceled),
      // still proceed to clear our stored metadata.
    }
  }

  const nextUnsafe: Record<string, any> = {
    ...meta,
    tier: "free",
    // Keep stripeCustomerId if it exists (helps future upgrades),
    // but clear any old subscription tracking.
    stripeSubscriptionId: undefined,
    stripeSubscriptionStatus: "free",
  };

  // Remove undefined keys to keep metadata clean.
  Object.keys(nextUnsafe).forEach((k) => nextUnsafe[k] === undefined && delete nextUnsafe[k]);

  await client.users.updateUser(userId, { unsafeMetadata: nextUnsafe });

  return Response.json({ ok: true });
}
