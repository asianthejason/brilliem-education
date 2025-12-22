import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

type PaymentMethodSummary =
  | {
      hasCustomer: false;
      hasPaymentMethod: false;
    }
  | {
      hasCustomer: true;
      hasPaymentMethod: boolean;
      brand?: string;
      last4?: string;
      expMonth?: number;
      expYear?: number;
    };

function summarizeCard(pm: any): PaymentMethodSummary {
  const card = pm?.card;
  if (!card) return { hasCustomer: true, hasPaymentMethod: false };
  return {
    hasCustomer: true,
    hasPaymentMethod: true,
    brand: card.brand,
    last4: card.last4,
    expMonth: card.exp_month,
    expYear: card.exp_year,
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const meta = (user.unsafeMetadata || {}) as Record<string, any>;

  const customerId = meta.stripeCustomerId as string | undefined;
  const subscriptionId = meta.stripeSubscriptionId as string | undefined;

  if (!customerId) {
    return Response.json({ hasCustomer: false, hasPaymentMethod: false } satisfies PaymentMethodSummary);
  }

  // 1) Prefer subscription.default_payment_method (it overrides customer default)
  try {
    if (subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["default_payment_method"],
      });

      const subPM = (sub as any).default_payment_method;
      if (subPM && typeof subPM === "object" && subPM.type === "card") {
        return Response.json(summarizeCard(subPM));
      }
    }
  } catch {
    // ignore (subscription may be missing or canceled)
  }

  // 2) Fall back to customer.invoice_settings.default_payment_method
  try {
    const customer = (await stripe.customers.retrieve(customerId, {
      expand: ["invoice_settings.default_payment_method"],
    })) as any;

    const custPM = customer?.invoice_settings?.default_payment_method;
    if (custPM && typeof custPM === "object" && custPM.type === "card") {
      return Response.json(summarizeCard(custPM));
    }
  } catch {
    // ignore
  }

  return Response.json({ hasCustomer: true, hasPaymentMethod: false } satisfies PaymentMethodSummary);
}
