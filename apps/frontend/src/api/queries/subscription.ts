"use client";

import { client } from "@/api/client";
import { useApiMutation } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";
import type { CreateCheckoutBody } from "@/api/types/subscription";
import { ROUTES } from "@/lib/constants";

type CheckoutValues = Pick<CreateCheckoutBody, "plan" | "promoCode">;

interface RedirectSession {
  url: string;
}

const redirectTo = (session: RedirectSession) => {
  window.location.href = session.url;
};

/** Starts a Stripe checkout and redirects to it. */
export function useCheckout() {
  return useApiMutation(
    (values: CheckoutValues) =>
      client.api.subscription.checkout.post({
        ...values,
        successUrl: `${ROUTES.billing}?success=true`,
        cancelUrl: `${ROUTES.billing}?canceled=true`,
      }),
    { errorMessage: "Failed to start checkout", onSuccess: redirectTo },
  );
}

/** Opens the Stripe billing portal. */
export function useBillingPortal() {
  return useApiMutation(() => client.api.subscription.portal.post({ returnUrl: ROUTES.billing }), {
    errorMessage: "Failed to open billing portal",
    onSuccess: redirectTo,
  });
}

/** Cancels the subscription at the end of the billing period. */
export function useCancelSubscription() {
  return useApiMutation(() => client.api.subscription.cancel.post(), {
    successMessage: "Subscription will cancel at the end of the billing period",
    errorMessage: "Failed to cancel subscription",
    invalidateKeys: [queryKeys.subscription.current()],
  });
}

/** Reverses a scheduled cancellation. */
export function useResumeSubscription() {
  return useApiMutation(() => client.api.subscription.resume.post(), {
    successMessage: "Subscription cancellation reversed",
    errorMessage: "Failed to resume subscription",
    invalidateKeys: [queryKeys.subscription.current()],
  });
}
