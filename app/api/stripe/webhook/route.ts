import { headers } from "next/headers";
import { clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

function tierFromPriceId(priceId?: string | null) {
  const lessons =
    process.env.STRIPE_PRICE_LESSONS ||
    process.env.STRIPE_LESSONS_PRICE_ID ||
    process.env.LESSONS_PRICE_ID;

  const lessonsAi =
    process.env.STRIPE_PRICE_LESSONS_AI_TUTOR ||
    process.env.STRIPE_PRICE_LESSONS_AI ||
    process.env.STRIPE_LESSONS_AI_PRICE_ID ||
    process.env.LESSONS_AI_PRICE_ID;

  if (lessons && priceId === lessons) return "lessons";
  if (lessonsAi && priceId === lessonsAi) return "lessons_ai";
  return "free";
}

export async function POST(req: Request) {
  const sig = (await headers()).get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return new Response("Webhook not configured", { status: 400 });

  const rawBody = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err: any) {
    return new Response(`Webhook error: ${err?.message || "Invalid signature"}`, { status: 400 });
  }

  const client = await clerkClient();

  try {
    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object as any;
      const clerkUserId = sub?.metadata?.clerkUserId as string | undefined;
      if (!clerkUserId) return new Response("ok");

      const priceId = sub?.items?.data?.[0]?.price?.id as string | undefined;
      const derivedTier = tierFromPriceId(priceId);

      const user = await client.users.getUser(clerkUserId);
      const meta = (user.unsafeMetadata || {}) as Record<string, any>;

      if (sub.cancel_at_period_end) {
        const nextUnsafe: Record<string, any> = {
          ...meta,
          tier: derivedTier,
          pendingTier: "free",
          pendingTierEffective: sub.current_period_end,
          stripeSubscriptionId: sub.id,
          stripeSubscriptionStatus: sub.status,
          stripeCustomerId: sub.customer,
        };
        Object.keys(nextUnsafe).forEach((k) => nextUnsafe[k] === undefined && delete nextUnsafe[k]);
        await client.users.updateUser(clerkUserId, { unsafeMetadata: nextUnsafe });
        return new Response("ok");
      }

      const nextUnsafe: Record<string, any> = {
        ...meta,
        tier: derivedTier,
        pendingTier: undefined,
        pendingTierEffective: undefined,
        stripeSubscriptionId: sub.id,
        stripeSubscriptionStatus: sub.status,
        stripeCustomerId: sub.customer,
      };
      Object.keys(nextUnsafe).forEach((k) => nextUnsafe[k] === undefined && delete nextUnsafe[k]);
      await client.users.updateUser(clerkUserId, { unsafeMetadata: nextUnsafe });

      return new Response("ok");
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as any;
      const clerkUserId = sub?.metadata?.clerkUserId as string | undefined;
      if (!clerkUserId) return new Response("ok");

      const user = await client.users.getUser(clerkUserId);
      const meta = (user.unsafeMetadata || {}) as Record<string, any>;

      const nextUnsafe: Record<string, any> = {
        ...meta,
        tier: "free",
        pendingTier: undefined,
        pendingTierEffective: undefined,
        stripeSubscriptionId: undefined,
        stripeSubscriptionStatus: "canceled",
        stripeCustomerId: sub.customer,
      };
      Object.keys(nextUnsafe).forEach((k) => nextUnsafe[k] === undefined && delete nextUnsafe[k]);
      await client.users.updateUser(clerkUserId, { unsafeMetadata: nextUnsafe });

      return new Response("ok");
    }

    return new Response("ok");
  } catch (e: any) {
    return new Response(`Webhook handler error: ${e?.message || "unknown"}`, { status: 500 });
  }
}
