import { createApiClient } from "@depvault/shared/api";
import { cookies } from "next/headers";
import { cache } from "react";
import { API_BASE_URL, COOKIE_NAMES } from "@/lib/constants";

interface GetServerClientOptions {
  auth?: boolean;
}

/** Creates a server-side API client, forwarding the access-token cookie as a Bearer header. */
export async function getServerClient(options: GetServerClientOptions = {}) {
  const { auth = true } = options;
  if (!auth) {
    return createApiClient(API_BASE_URL);
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(COOKIE_NAMES.accessToken)?.value;

  return createApiClient(API_BASE_URL, {
    headers: {
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
    },
  });
}

/** The signed-in user, or null; `cache` dedupes the lookup across layouts and pages per request. */
export const getCurrentUser = cache(async () => {
  const client = await getServerClient();
  const { data, error } = await client.api.users.me.get();
  return error ? null : data;
});
