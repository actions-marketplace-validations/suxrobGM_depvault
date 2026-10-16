import type { Body, Data } from "@depvault/shared/api";
import type { client } from "@/api/client";

type Subscription = typeof client.api.subscription;

export type SubscriptionDto = Data<Subscription["get"]>;

export type CheckoutSessionDto = Data<Subscription["checkout"]["post"]>;
export type CreateCheckoutBody = Body<Subscription["checkout"]["post"]>;

export type PortalSessionDto = Data<Subscription["portal"]["post"]>;
