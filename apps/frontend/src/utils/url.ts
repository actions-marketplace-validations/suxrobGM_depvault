import type { Route } from "next";

/**
 * Validates a post-auth redirect target (e.g. `?redirect=/cli/verify?code=ABCD-EFGH`).
 *
 * Returns the value only if it is a safe, same-origin relative path; otherwise `null`. This guards
 * against open-redirect attacks where a crafted `redirect` param points at an external site.
 */
export function safeRedirect(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  // Must be a root-relative path ("/path"). Reject absolute URLs ("https://evil"),
  // protocol-relative ("//evil"), and backslash variants ("/\\evil") that some browsers
  // normalize to protocol-relative.
  if (!value.startsWith("/")) {
    return null;
  }
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  return value;
}

/**
 * Builds an auth-route URL that carries a post-auth return path (`?redirect=…`).
 *
 * The target is run through {@link safeRedirect}, so an unsafe or absent value degrades to the
 * bare route rather than propagating an attacker-controlled destination. Returning to the site
 * root carries no param, since that is where auth lands by default.
 */
export function withRedirect(route: Route, returnTo: string | null | undefined): Route {
  const target = safeRedirect(returnTo);
  if (!target || target === "/") {
    return route;
  }

  return `${route}?redirect=${encodeURIComponent(target)}` as Route;
}
