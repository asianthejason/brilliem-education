import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

/**
 * Response union used by the Subscription page.
 *
 * NOTE: We keep intermediate variables strongly typed as the "customer" variant
 * once we know a customer exists, to avoid TS widening during object spreads.
 */

type PaymentMethodSummaryNoCustomer = {
  hasCustomer: false;
  hasPaymentMethod: false;
  nextPaymentAt: null;
  nextPaymentAmount: null;
  nextPaymentCurrency: null;
  cancelsAt: null;
};

type PaymentMethodSummaryCustomer = {
  hasCustomer: true;
  hasPaymentMethod: boolean;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  nextPaymentAt: number | null;
  nextPaymentAmount: number | null;
  nextPaymentCurrency: string | null;
  cancelsAt: number | null;
};

type PaymentMethodSummary = PaymentMethodSummaryNoCustomer | PaymentMethodSummaryCustomer;

function summarizeCard(pm: any): Pick<
  PaymentMethodSummaryCustomer,
  "hasPaymentMethod" | "brand" | "last4" | "expMonth" | "expYear"
> | null {
  const card = pm?.card;
  if (!card) return null;
  return {
    hasPaymentMethod: true,
    brand: String(card.brand ?? ""),
    last4: String(card.last4 ?? ""),
    expMonth: Number(card.exp_month),
    expYear: Number(card.exp_year),
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
    const noCustomer: PaymentMethodSummaryNoCustomer = {
      hasCustomer: false,
      hasPaymentMethod: false,
      nextPaymentAt: null,
      nextPaymentAmount: null,
      nextPaymentCurrency: null,
      cancelsAt: null,
    };
    return Response.json(noCustomer satisfies PaymentMethodSummary);
  }

  let summary: PaymentMethodSummaryCustomer = {
    hasCustomer: true,
    hasPaymentMethod: false,
    nextPaymentAt: null,
    nextPaymentAmount: null,
    nextPaymentCurrency: null,
    cancelsAt: null,
  };

  // 1) Try subscription default PM first (most accurate)
  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["default_payment_method", "schedule"],
      });

      const subPM = (sub as any).default_payment_method;
      if (subPM && typeof subPM === "object" && subPM.type === "card") {
        const cardBits = summarizeCard(subPM);
        if (cardBits) summary = { ...summary, ...cardBits };
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
        const nextAt = sub.current_period_end as number;

        // Amount (use upcoming invoice total when available)
        let nextAmt: number | null = null;
        let nextCur: string | null = null;
        try {
          const upcoming = await stripe.invoices.retrieveUpcoming({
            customer: customerId,
            subscription: subscriptionId,
          } as any);
          nextAmt = (upcoming.total ?? null) as any;
          nextCur = (upcoming.currency ?? null) as any;
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
      const cardBits = summarizeCard(custPM);
      if (cardBits) summary = { ...summary, ...cardBits };
    }
  } catch {
    // ignore
  }

  return Response.json(summary satisfies PaymentMethodSummary);
}
