import { safeRedirect } from "@depvault/shared/utils";
import type { Route } from "next";
import { API_BASE_URL } from "@/lib/constants";

export { safeRedirect } from "@depvault/shared/utils";

/**
 * Hangs a validated `?redirect=` param off a base URL. An unsafe or absent target degrades to the
 * bare URL rather than propagating an attacker-controlled destination; the site root carries no
 * param, since that is where auth lands by default.
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

/**
 * Builds the GitHub OAuth entry URL. The return path is handed to the backend, which carries it
 * through the round-trip in the OAuth `state` param and redirects there after sign-in.
 */
export function githubAuthUrl(returnTo?: string | null): string {
  return appendRedirect(`${API_BASE_URL}/api/auth/github`, returnTo);
}
