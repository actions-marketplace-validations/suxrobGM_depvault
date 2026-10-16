import { safeRedirect } from "@depvault/shared/utils";
import type { Route } from "next";
import { API_BASE_URL } from "@/lib/constants";

export { safeRedirect } from "@depvault/shared/utils";

/**
 * Appends a validated `?redirect=` param. Unsafe or absent targets yield the bare URL so an
 * attacker-controlled destination never propagates; the root is omitted as the default landing.
 */
function appendRedirect(base: string, returnTo: string | null | undefined): string {
  const target = safeRedirect(returnTo);
  if (!target || target === "/") {
    return base;
  }

  return `${base}?redirect=${encodeURIComponent(target)}`;
}

/** Builds an auth-route URL that carries a post-auth return path. */
export function withRedirect(route: Route, returnTo: string | null | undefined): Route {
  return appendRedirect(route, returnTo) as Route;
}

/** Builds the GitHub OAuth entry URL; the backend round-trips `returnTo` via the OAuth `state`. */
export function githubAuthUrl(returnTo?: string | null): string {
  return appendRedirect(`${API_BASE_URL}/api/auth/github`, returnTo);
}
