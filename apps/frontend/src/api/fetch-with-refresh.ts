import { API_BASE_URL, ROUTES } from "@/lib/constants";
import { withRedirect } from "@/utils/url";

const REFRESH_URL = `${API_BASE_URL}/api/auth/session`;

// Shared so concurrent 401s trigger a single refresh.
let refreshPromise: Promise<boolean> | null = null;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(REFRESH_URL, {
      method: "PUT",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * `fetch` with silent token refresh: on 401 it calls `PUT /api/auth/session` (refresh cookie →
 * new access cookie) and retries once; if the refresh fails, it redirects to login.
 */
export async function fetchWithRefresh(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);

  if (response.status !== 401) {
    return response;
  }

  // Don't intercept auth endpoints to avoid redirect loops
  const url = requestUrl(input);
  if (url.includes("/api/auth/")) {
    return response;
  }

  if (!refreshPromise) {
    refreshPromise = tryRefresh().finally(() => {
      refreshPromise = null;
    });
  }

  const refreshed = await refreshPromise;
  if (!refreshed) {
    window.location.href = withRedirect(
      ROUTES.login,
      window.location.pathname + window.location.search,
    );
    return response;
  }

  return fetch(input, init);
}
