import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

type Tier = "free" | "lessons" | "lessons_ai";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json()) as { sessionId?: string };
  const sessionId = body.sessionId;
  if (!sessionId) return new Response("Missing sessionId", { status: 400 });

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });

  const ref = session.client_reference_id || (session.metadata?.clerkUserId as string | undefined);
  if (ref !== userId) return new Response("Session does not belong to this user", { status: 403 });

  const tier = session.metadata?.tier as Tier | undefined;
  if (!tier || tier === "free") return new Response("Missing tier metadata", { status: 400 });

  // Basic success checks:
  // - For subscriptions, Checkout is typically "paid" when payment completes.
  // - Some setups can have a trial with no immediate payment; in that case payment_status may be "no_payment_required".
  const okPayment =
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required" ||
    session.status === "complete";

  if (!okPayment) {
    return new Response(`Checkout not completed (payment_status=${session.payment_status})`, {
      status: 400,
    });
  }

  const sub =
    typeof session.subscription === "string"
      ? { id: session.subscription }
      : (session.subscription as { id: string } | null);

  const subscriptionId = sub?.id || null;
  const customerId = typeof session.customer === "string" ? session.customer : null;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const existing = (user.unsafeMetadata ?? {}) as Record<string, unknown>;

  await client.users.updateUser(userId, {
    unsafeMetadata: {
      ...existing,
      tier,
      requestedTier: null,
      stripeCustomerId: customerId ?? (existing.stripeCustomerId as string | undefined) ?? null,
      stripeSubscriptionId: subscriptionId,
      stripeCheckoutSessionId: session.id,
    },
  });

  return Response.json({ ok: true, tier, subscriptionId });
}
