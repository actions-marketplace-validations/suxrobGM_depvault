import type Stripe from "stripe";

const toDate = (seconds: number | undefined) => (seconds ? new Date(seconds * 1000) : null);

/** Extracts period dates from a Stripe subscription's first item (Stripe v20+). */
export function extractPeriodDates(sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  return {
    currentPeriodStart: toDate(item?.current_period_start),
    currentPeriodEnd: toDate(item?.current_period_end),
  };
}
