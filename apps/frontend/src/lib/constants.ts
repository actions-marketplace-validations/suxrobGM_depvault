import type { Route } from "next";

/**
 * App routes. Static entries are literal types that `typedRoutes` checks at each use; the
 * dynamic builders are cast once here because template literals can't be proven to match.
 */
export const ROUTES = {
  home: "/",
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  verifyEmail: "/verify-email",
  overview: "/overview",
  profileGeneral: "/profile/general",
  profileSecurity: "/profile/security",
  pricing: "/pricing",
  terms: "/terms",
  privacy: "/privacy",
  projects: "/projects",
  project: (id: string) => `/projects/${id}` as Route,
  projectOverview: (id: string) => `/projects/${id}/overview` as Route,
  projectMembers: (id: string) => `/projects/${id}/members` as Route,
  projectSettings: (id: string) => `/projects/${id}/settings` as Route,
  projectAnalysis: (id: string) => `/projects/${id}/analysis` as Route,
  projectAnalysisDetail: (id: string, analysisId: string) =>
    `/projects/${id}/analysis/${analysisId}` as Route,
  projectFiles: (id: string) => `/projects/${id}/files` as Route,
  projectActivity: (id: string) => `/projects/${id}/activity` as Route,
  projectSecretScanning: (id: string) => `/projects/${id}/secret-scanning` as Route,
  projectLicenses: (id: string) => `/projects/${id}/licenses` as Route,
  activity: "/activity",
  security: "/security",
  settings: "/settings",
  billing: "/settings/billing",
  admin: "/admin",
  adminUsers: "/admin/users",
  adminSubscriptions: "/admin/subscriptions",
  /** Path prefix of share-link pages (`/s/[token]`), not a page itself. */
  share: "/s",
  notifications: "/notifications",
  /** Served by the docs app behind the same origin, so it is not in this app's route list. */
  docs: "/docs" as Route,
} as const;

export const COOKIE_NAMES = {
  accessToken: "access_token",
  refreshToken: "refresh_token",
  timezone: "timezone",
} as const;

export const PAGINATION_DEFAULTS = {
  page: 1,
  limit: 25,
} as const;

type PlanVariant = "default" | "info" | "success";

/** Badge colour per subscription plan, shared by billing, admin tables and the sidebar. */
export const PLAN_VARIANT: Record<string, PlanVariant> = {
  FREE: "default",
  PRO: "info",
  TEAM: "success",
};

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/** Cloudflare Turnstile site key; null hides the CAPTCHA (local dev). */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;

/** How long a "remember on this device" vault session persists before expiring. */
export const REMEMBER_DEVICE_DAYS = 30;
export const REMEMBER_DEVICE_MS = REMEMBER_DEVICE_DAYS * 24 * 60 * 60 * 1000;
