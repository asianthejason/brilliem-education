import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

function summarizeCard(pm: any) {
  const card = pm?.card;
  if (!card) return null;
  return {
    brand: card.brand,
    last4: card.last4,
    expMonth: card.exp_month,
    expYear: card.exp_year,
  };
}

/**
 * After the client confirms a SetupIntent, call this endpoint to:
 *  - verify the SetupIntent belongs to the signed-in user
 *  - set the resulting PaymentMethod as the default for invoices
 *  - set it as default on the active subscription (if any)
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => null)) as { setupIntentId?: string } | null;
  const setupIntentId = body?.setupIntentId;
  if (!setupIntentId) return new Response("Missing setupIntentId", { status: 400 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const meta = (user.unsafeMetadata || {}) as Record<string, any>;

  const customerId = meta.stripeCustomerId as string | undefined;
  const subscriptionId = meta.stripeSubscriptionId as string | undefined;

  if (!customerId) return new Response("No Stripe customer for this user", { status: 400 });

  const si = (await stripe.setupIntents.retrieve(setupIntentId, {
    expand: ["payment_method"],
  })) as any;

  if (si.customer && typeof si.customer === "string" && si.customer !== customerId) {
    return new Response("SetupIntent does not belong to this customer", { status: 403 });
  }

  if (si.status !== "succeeded" && si.status !== "processing") {
    return new Response(`SetupIntent not completed (status: ${si.status})`, { status: 400 });
  }

  const pmObj = si.payment_method;
  const pmId = typeof pmObj === "string" ? pmObj : (pmObj?.id as string | undefined);
  if (!pmId) return new Response("Missing payment method on SetupIntent", { status: 400 });

  // Always set customer default.
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: pmId },
  });

  // Also set subscription default if we have one.
  if (subscriptionId) {
    try {
      await stripe.subscriptions.update(subscriptionId, {
        default_payment_method: pmId,
      });
    } catch {
      // subscription might be canceled or missing; customer default still applies
    }
  }

  const cardSummary = summarizeCard(typeof pmObj === "object" ? pmObj : null);

  return Response.json({ ok: true, paymentMethod: cardSummary });
}
