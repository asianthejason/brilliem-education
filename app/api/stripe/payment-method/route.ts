import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

type PaymentMethodSummary =
  | {
      hasCustomer: false;
      hasPaymentMethod: false;
      nextPaymentAt?: null;
      nextPaymentAmount?: null;
      nextPaymentCurrency?: null;
      cancelsAt?: null;
    }
  | {
      hasCustomer: true;
      hasPaymentMethod: boolean;
      brand?: string;
      last4?: string;
      expMonth?: number;
      expYear?: number;
      nextPaymentAt?: number | null;
      nextPaymentAmount?: number | null;
      nextPaymentCurrency?: string | null;
      cancelsAt?: number | null;
    };

function summarizeCard(pm: any) {
  const card = pm?.card;
  if (!card) return null;
  return {
    hasCustomer: true,
    hasPaymentMethod: true,
    brand: card.brand as string,
    last4: card.last4 as string,
    expMonth: card.exp_month as number,
    expYear: card.exp_year as number,
  } satisfies PaymentMethodSummary;
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

  let summary: PaymentMethodSummary = { hasCustomer: true, hasPaymentMethod: false };

  // 1) Try subscription default PM first (most accurate)
  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["default_payment_method", "schedule"],
      });

      const subPM = (sub as any).default_payment_method;
      if (subPM && typeof subPM === "object" && subPM.type === "card") {
        summary = summarizeCard(subPM) as PaymentMethodSummary;
      }

      // Next payment info for header
      if (sub.cancel_at_period_end) {
        summary = {
          ...summary,
          nextPaymentAt: null,
          nextPaymentAmount: null,
          nextPaymentCurrency: null,
          cancelsAt: sub.current_period_end as number,
        };
      } else {
        // Date
        const nextAt = sub.current_period_end as number;

        // Amount (use upcoming invoice total)
        let nextAmt: number | null = null;
        let nextCur: string | null = null;
        try {
          const upcoming = await stripe.invoices.retrieveUpcoming({
            customer: customerId,
            subscription: subscriptionId,
          } as any);
          nextAmt = upcoming.total ?? null;
          nextCur = upcoming.currency ?? null;
        } catch {
          // ignore
        }

        summary = {
          ...summary,
          nextPaymentAt: nextAt,
          nextPaymentAmount: nextAmt,
          nextPaymentCurrency: nextCur,
          cancelsAt: null,
        };
      }
    } catch {
      // ignore subscription errors; fall back to customer default PM
    }
  }

  // 2) Fall back to customer.invoice_settings.default_payment_method
  try {
    const customer = (await stripe.customers.retrieve(customerId, {
      expand: ["invoice_settings.default_payment_method"],
    })) as any;

    const custPM = customer?.invoice_settings?.default_payment_method;
    if (custPM && typeof custPM === "object" && custPM.type === "card") {
      const cardOnly = summarizeCard(custPM) as PaymentMethodSummary;
      summary = { ...summary, ...cardOnly };
    }
  } catch {
    // ignore
  }

  return Response.json(summary satisfies PaymentMethodSummary);
}
