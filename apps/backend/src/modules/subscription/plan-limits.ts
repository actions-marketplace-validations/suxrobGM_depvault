import { INFINITE_LIMIT } from "@depvault/shared/constants";
import { type Subscription, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

export interface PlanLimits {
  maxUsers: number;
  maxProjects: number;
  maxRepoFiles: number;
  maxAnalysesPerMonth: number;
  maxCiTokens: number;
  auditLogRetentionDays: number;
  gitSecretScanning: boolean;
  ipAllowlists: boolean;
  secretSharing: boolean;
  prioritySupport: boolean;
}

const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  FREE: {
    maxUsers: 1,
    maxProjects: 3,
    maxRepoFiles: 100,
    maxAnalysesPerMonth: 30,
    maxCiTokens: 5,
    auditLogRetentionDays: 0,
    gitSecretScanning: false,
    ipAllowlists: false,
    secretSharing: true,
    prioritySupport: false,
  },
  PRO: {
    maxUsers: 10,
    maxProjects: 20,
    maxRepoFiles: 1000,
    maxAnalysesPerMonth: 200,
    maxCiTokens: 20,
    auditLogRetentionDays: 30,
    gitSecretScanning: true,
    ipAllowlists: false,
    secretSharing: true,
    prioritySupport: false,
  },
  TEAM: {
    maxUsers: INFINITE_LIMIT,
    maxProjects: INFINITE_LIMIT,
    maxRepoFiles: INFINITE_LIMIT,
    maxAnalysesPerMonth: INFINITE_LIMIT,
    maxCiTokens: INFINITE_LIMIT,
    auditLogRetentionDays: 365,
    gitSecretScanning: true,
    ipAllowlists: true,
    secretSharing: true,
    prioritySupport: true,
  },
};

/** Plan pricing in cents for display and MRR calculation */
export const PLAN_PRICING: Record<SubscriptionPlan, number> = {
  FREE: 0,
  PRO: 500, // $5.00 per user per month
  TEAM: 1000, // $10.00 per user per month
};

/** PAST_DUE keeps paid access while Stripe retries the payment. */
const PAID_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.PAST_DUE,
]);

/** The plan whose limits apply: a lapsed paid subscription (or none at all) falls back to FREE. */
export function effectivePlan(
  subscription: Pick<Subscription, "plan" | "status" | "isComp"> | null,
): SubscriptionPlan {
  if (!subscription) return SubscriptionPlan.FREE;
  return subscription.isComp || PAID_STATUSES.has(subscription.status)
    ? subscription.plan
    : SubscriptionPlan.FREE;
}

/** Returns the plan limits for a given plan */
export function getPlanLimits(plan: SubscriptionPlan): PlanLimits {
  return PLAN_LIMITS[plan];
}
