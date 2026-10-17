import type { Cookie } from "elysia";
import { env } from "@/env";
import type { AuthResponse } from "./auth.schema";

const IS_PROD = env.NODE_ENV === "production";

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

/**
 * Parses a duration like "15m" or "2h" (units s/m/h/d/w) into seconds, returning `fallback`
 * when the input is missing or invalid.
 */
function parseExpiry(expiry: string | undefined, fallback: number): number {
  if (!expiry) {
    return fallback;
  }

  const match = /^(\d+)([smhdw]?)$/.exec(expiry.trim());
  if (!match) {
    return fallback;
  }

  const value = parseInt(match[1]!, 10);
  const unit = match[2] || "s";
  return value * (UNIT_SECONDS[unit] ?? 1);
}

/**
 * Refresh token lifetime from `REFRESH_TOKEN_EXPIRY` (default 7 days). Shared by the cookie's
 * `maxAge` and `AuthSession.expiresAt` so the two cannot drift apart.
 */
export function refreshTokenTtlSeconds(): number {
  return parseExpiry(env.REFRESH_TOKEN_EXPIRY, 7 * 24 * 60 * 60);
}

export function setAuthCookies(cookie: Record<string, Cookie<unknown>>, result: AuthResponse) {
  const accessMaxAge = parseExpiry(env.JWT_EXPIRY, 24 * 60 * 60);
  const refreshMaxAge = refreshTokenTtlSeconds();

  cookie.access_token!.value = result.accessToken;
  cookie.access_token!.set({
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "strict" : "lax",
    path: "/",
    maxAge: accessMaxAge,
  });
  cookie.refresh_token!.value = result.refreshToken;
  cookie.refresh_token!.set({
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "strict" : "lax",
    path: "/api/auth",
    maxAge: refreshMaxAge,
  });
}

export function clearAuthCookies(cookie: Record<string, Cookie<unknown>>) {
  cookie.access_token!.value = "";
  cookie.access_token!.set({
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "strict" : "lax",
    path: "/",
    maxAge: 0,
  });
  cookie.refresh_token!.value = "";
  cookie.refresh_token!.set({
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "strict" : "lax",
    path: "/api/auth",
    maxAge: 0,
  });
}
