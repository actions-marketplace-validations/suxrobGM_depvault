"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { client } from "@/api/client";
import { useApiMutation, useApiQuery } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";
import type { CompSubscriptionBody } from "@/api/types/admin";

type PlanName = CompSubscriptionBody["plan"] | "FREE";

interface PageParams {
  page: number;
  pageSize: number;
}

interface AdminUsersParams extends PageParams {
  search: string;
  plan: PlanName | "ALL";
}

interface AdminSubscriptionsParams extends PageParams {
  plan: PlanName | "ALL";
  status: string;
}

/** Platform-wide user, revenue and plan counters. */
export function useAdminStats() {
  return useApiQuery(queryKeys.admin.stats(), () => client.api.admin.stats.get(), {
    errorMessage: "Failed to load admin stats",
  });
}

/** One page of users, searchable by name/email and filterable by plan. */
export function useAdminUsers(params: AdminUsersParams) {
  const { page, pageSize, search, plan } = params;
  return useApiQuery(
    queryKeys.admin.usersList(params),
    () =>
      client.api.admin.users.get({
        query: {
          page,
          limit: pageSize,
          ...(search && { search }),
          ...(plan !== "ALL" && { plan }),
        },
      }),
    { errorMessage: "Failed to load users", placeholderData: keepPreviousData },
  );
}

/** One user's profile, usage and subscription; idle until a user is picked. */
export function useAdminUser(userId: string | null) {
  return useApiQuery(
    queryKeys.admin.userDetail(userId),
    () => client.api.admin.users({ id: userId ?? "" }).get(),
    { enabled: userId !== null, errorMessage: "Failed to load user details" },
  );
}

/** One page of subscriptions, filterable by plan and status. */
export function useAdminSubscriptions(params: AdminSubscriptionsParams) {
  const { page, pageSize, plan, status } = params;
  return useApiQuery(
    queryKeys.admin.subscriptionsList(params),
    () =>
      client.api.admin.subscriptions.get({
        query: {
          page,
          limit: pageSize,
          ...(plan !== "ALL" && { plan }),
          ...(status !== "ALL" && { status }),
        },
      }),
    { errorMessage: "Failed to load subscriptions", placeholderData: keepPreviousData },
  );
}

/** Grants a user a complimentary plan; users, subscriptions and stats all change. */
export function useAssignCompSubscription(userId: string | null) {
  return useApiMutation(
    (body: CompSubscriptionBody) =>
      client.api.admin.users({ id: userId ?? "" }).subscription.patch(body),
    {
      invalidateKeys: [queryKeys.admin.all],
      successMessage: "Subscription assigned successfully",
      errorMessage: "Failed to assign subscription",
    },
  );
}

/** Removes a user's complimentary plan. */
export function useRevokeCompSubscription(userId: string | null) {
  return useApiMutation(() => client.api.admin.users({ id: userId ?? "" }).subscription.delete(), {
    invalidateKeys: [queryKeys.admin.all],
    successMessage: "Subscription revoked successfully",
    errorMessage: "Failed to revoke subscription",
  });
}
