import { type Static, t } from "elysia";

export const CreateCheckoutBodySchema = t.Object({
  plan: t.Union([t.Literal("PRO"), t.Literal("TEAM")]),
  quantity: t.Optional(t.Integer({ minimum: 1, default: 1 })),
  promoCode: t.Optional(t.String()),
  successUrl: t.String(),
  cancelUrl: t.String(),
});

export const CreatePortalSessionBodySchema = t.Object({
  returnUrl: t.String(),
});

export const CheckoutSessionResponseSchema = t.Object({
  url: t.String(),
});

export const PortalSessionResponseSchema = t.Object({
  url: t.String(),
});

const PlanLimitsSchema = t.Object({
  maxUsers: t.Number(),
  maxProjects: t.Number(),
  maxRepoFiles: t.Number(),
  maxAnalysesPerMonth: t.Number(),
  maxCiTokens: t.Number(),
  auditLogRetentionDays: t.Number(),
  gitSecretScanning: t.Boolean(),
  ipAllowlists: t.Boolean(),
  secretSharing: t.Boolean(),
  prioritySupport: t.Boolean(),
});

const UsageSchema = t.Object({
  projects: t.Number(),
  repoFiles: t.Number(),
  analyses: t.Number(),
  members: t.Number(),
  ciTokens: t.Number(),
});

export const SubscriptionResponseSchema = t.Object({
  id: t.String(),
  plan: t.String(),
  status: t.String(),
  stripeCustomerId: t.Nullable(t.String()),
  stripeSubscriptionId: t.Nullable(t.String()),
  quantity: t.Number(),
  currentPeriodStart: t.Nullable(t.Date()),
  currentPeriodEnd: t.Nullable(t.Date()),
  cancelAtPeriodEnd: t.Boolean(),
  isComp: t.Boolean(),
  limits: PlanLimitsSchema,
  usage: UsageSchema,
});

const PlanInfoSchema = t.Object({
  name: t.String(),
  plan: t.String(),
  pricePerUser: t.Number(),
  limits: PlanLimitsSchema,
});

export const PlansResponseSchema = t.Array(PlanInfoSchema);

export type CreateCheckoutBody = Static<typeof CreateCheckoutBodySchema>;
export type SubscriptionResponse = Static<typeof SubscriptionResponseSchema>;
