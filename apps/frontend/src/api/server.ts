import { createApiClient } from "@depvault/shared/api";
import { cookies } from "next/headers";
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
