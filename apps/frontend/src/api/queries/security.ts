"use client";

import { client } from "@/api/client";
import { useApiQuery } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";

/** Vulnerability and secret-scan totals across the user's projects. */
export function useSecurityOverview() {
  return useApiQuery(queryKeys.security.overview(), () => client.api.security.overview.get(), {
    errorMessage: "Failed to load security overview",
  });
}
