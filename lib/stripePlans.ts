export type Tier = "free" | "lessons" | "lessons_ai";
export type PaidTier = Exclude<Tier, "free">;
export type BillingInterval = "month" | "year";

type TierIntervalKey = `${PaidTier}_${BillingInterval}`;

function firstDefined(values: Array<string | undefined | null>) {
  for (const v of values) {
    if (v) return v;
  }
  return undefined;
}

/**
 * Returns the Stripe Price ID for a tier + billing interval.
 *
 * Supported env vars (prefer these going forward):
 * - STRIPE_PRICE_LESSONS_MONTHLY
 * - STRIPE_PRICE_LESSONS_YEARLY
 * - STRIPE_PRICE_LESSONS_AI_TUTOR_MONTHLY
 * - STRIPE_PRICE_LESSONS_AI_TUTOR_YEARLY
 *
 * Backwards-compatible fallbacks are included so existing monthly deployments
 * continue to work without changing env names.
 */
export function priceIdFor(tier: PaidTier, interval: BillingInterval): string | undefined {
  const lessonsMonthly = firstDefined([
    process.env.STRIPE_PRICE_LESSONS_MONTHLY,
    process.env.STRIPE_PRICE_LESSONS,
    process.env.STRIPE_LESSONS_PRICE_ID,
    process.env.LESSONS_PRICE_ID,
  ]);

  const lessonsYearly = firstDefined([
    process.env.STRIPE_PRICE_LESSONS_YEARLY,
    // common alternatives people use
    process.env.STRIPE_PRICE_LESSONS_ANNUAL,
    process.env.STRIPE_PRICE_LESSONS_YEAR,
    process.env.STRIPE_LESSONS_PRICE_ID_YEARLY,
    process.env.LESSONS_PRICE_ID_YEARLY,
  ]);

  const lessonsAiMonthly = firstDefined([
    process.env.STRIPE_PRICE_LESSONS_AI_TUTOR_MONTHLY,
    process.env.STRIPE_PRICE_LESSONS_AI_TUTOR,
    process.env.STRIPE_PRICE_LESSONS_AI,
    process.env.STRIPE_LESSONS_AI_TUTOR_PRICE_ID,
    process.env.LESSONS_AI_TUTOR_PRICE_ID,
    process.env.STRIPE_LESSONS_AI_PRICE_ID,
    process.env.LESSONS_AI_PRICE_ID,
  ]);

  const lessonsAiYearly = firstDefined([
    process.env.STRIPE_PRICE_LESSONS_AI_TUTOR_YEARLY,
    process.env.STRIPE_PRICE_LESSONS_AI_TUTOR_ANNUAL,
    process.env.STRIPE_PRICE_LESSONS_AI_TUTOR_YEAR,
    process.env.STRIPE_LESSONS_AI_TUTOR_PRICE_ID_YEARLY,
    process.env.LESSONS_AI_TUTOR_PRICE_ID_YEARLY,
    process.env.STRIPE_LESSONS_AI_PRICE_ID_YEARLY,
    process.env.LESSONS_AI_PRICE_ID_YEARLY,
  ]);

  const map: Record<TierIntervalKey, string | undefined> = {
    lessons_month: lessonsMonthly,
    lessons_year: lessonsYearly,
    lessons_ai_month: lessonsAiMonthly,
    lessons_ai_year: lessonsAiYearly,
  };

  return map[`${tier}_${interval}`];
}

export function tierFromPriceId(priceId?: string | null): Tier {
  if (!priceId) return "free";
  const candidates: Array<[Tier, string | undefined]> = [
    ["lessons", priceIdFor("lessons", "month")],
    ["lessons", priceIdFor("lessons", "year")],
    ["lessons_ai", priceIdFor("lessons_ai", "month")],
    ["lessons_ai", priceIdFor("lessons_ai", "year")],
  ];

  for (const [tier, id] of candidates) {
    if (id && id === priceId) return tier;
  }
  return "free";
}

export function intervalFromPriceRecurring(recurring?: { interval?: string | null } | null): BillingInterval {
  return recurring?.interval === "year" ? "year" : "month";
}
