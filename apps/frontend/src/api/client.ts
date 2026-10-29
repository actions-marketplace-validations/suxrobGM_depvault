"use client";

import { createApiClient } from "@depvault/shared/api";
import { API_BASE_URL } from "@/lib/constants";
import { fetchWithRefresh } from "./fetch-with-refresh";

export const client = createApiClient(API_BASE_URL, {
  // Bun's `typeof fetch` has a static `preconnect` a plain async function can't satisfy.
  fetcher: fetchWithRefresh as typeof fetch,
  fetch: {
    credentials: "include",
  },
});
