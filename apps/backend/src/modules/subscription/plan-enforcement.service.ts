import { INFINITE_LIMIT } from "@depvault/shared/constants";
import { inject, injectable } from "@needle-di/core";
import { PlanLimitError } from "@/common/errors/http.error";
import { PrismaClient } from "@/generated/prisma";
import { findProjectOwnerId } from "@/modules/project/project-ownership";
import type { PlanLimits } from "./plan-limits";
import { SubscriptionService } from "./subscription.service";

type BooleanFeature = keyof {
  [K in keyof PlanLimits as PlanLimits[K] extends boolean ? K : never]: PlanLimits[K];
};

type NumericLimit = Exclude<keyof PlanLimits, BooleanFeature>;

type LimitType = "project" | "repoFile" | "analysis" | "ciToken" | "member";

interface LimitRule {
  limit: NumericLimit;
  count: (subscriptions: SubscriptionService, ownerId: string) => Promise<number>;
  reached: string;
  upgrade: string;
}

const LIMIT_RULES: Record<LimitType, LimitRule> = {
  project: {
    limit: "maxProjects",
    count: (s, id) => s.countProjects(id),
    reached: "Project limit reached",
    upgrade: "create more projects",
  },
  repoFile: {
    limit: "maxRepoFiles",
    count: (s, id) => s.countRepoFiles(id),
    reached: "File limit reached",
    upgrade: "store more files",
  },
  analysis: {
    limit: "maxAnalysesPerMonth",
    count: (s, id) => s.countAnalysesThisMonth(id),
    reached: "Monthly analysis limit reached",
    upgrade: "get more analyses",
  },
  ciToken: {
    limit: "maxCiTokens",
    count: (s, id) => s.countActiveCiTokens(id),
    reached: "CI/CD token limit reached",
    upgrade: "get more tokens",
  },
  member: {
    limit: "maxUsers",
    count: (s, id) => s.countSeats(id),
    reached: "Member limit reached",
    upgrade: "add more team members",
  },
};

/** Checks plan limits and feature flags of the user whose plan pays for a resource. */
@injectable()
export class PlanEnforcementService {
  constructor(
    private readonly prisma = inject(PrismaClient),
    private readonly subscriptionService = inject(SubscriptionService),
  ) {}

  /**
   * Rejects when adding `adding` items of `type` would exceed the owner's plan limit. Pass 0 to
   * re-check something already counted (e.g. accepting a pending invitation).
   */
  async enforce(ownerId: string, type: LimitType, adding = 1): Promise<void> {
    const rule = LIMIT_RULES[type];
    const { limits } = await this.subscriptionService.getUserPlan(ownerId);
    const max = limits[rule.limit];
    if (max === INFINITE_LIMIT) return;

    const count = await rule.count(this.subscriptionService, ownerId);
    if (count + adding > max) {
      throw new PlanLimitError(
        `${rule.reached} (${count}/${max}). Upgrade your plan to ${rule.upgrade}.`,
      );
    }
  }

  /** {@link enforce} against the project owner's plan. */
  async enforceForProject(projectId: string, type: LimitType, adding = 1): Promise<void> {
    const ownerId = await findProjectOwnerId(this.prisma, projectId);
    return this.enforce(ownerId, type, adding);
  }

  /** Rejects when the project owner's plan lacks `feature`. */
  async enforceFeatureForProject(projectId: string, feature: BooleanFeature): Promise<void> {
    const ownerId = await findProjectOwnerId(this.prisma, projectId);
    const { limits } = await this.subscriptionService.getUserPlan(ownerId);
    if (!limits[feature]) {
      throw new PlanLimitError(
        `${feature} is not available on your current plan. Upgrade to access this feature.`,
      );
    }
  }
}
