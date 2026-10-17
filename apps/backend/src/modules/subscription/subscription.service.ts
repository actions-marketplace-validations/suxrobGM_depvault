import { singleton } from "tsyringe";
import { logger } from "@/common/logger/logger";
import {
  InvitationStatus,
  PrismaClient,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@/generated/prisma";
import { ownedBy } from "@/modules/project/project-ownership";
import { effectivePlan, getPlanLimits, type PlanLimits } from "./plan-limits";
import type { SubscriptionResponse } from "./subscription.schema";

/** Usage counters of everything a user's owned projects consume against plan limits. */
export interface PlanUsage {
  projects: number;
  repoFiles: number;
  analyses: number;
  members: number;
  ciTokens: number;
}

/** Manages subscription state, plan queries, and usage tracking. */
@singleton()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrCreateSubscription(userId: string) {
    const existing = await this.prisma.subscription.findUnique({ where: { userId } });
    if (existing) {
      return existing;
    }

    logger.info({ userId }, "Creating FREE subscription for new user");
    return this.prisma.subscription.create({
      data: { userId, plan: SubscriptionPlan.FREE, status: SubscriptionStatus.ACTIVE },
    });
  }

  /** The user's effective plan and its limits. */
  async getUserPlan(userId: string): Promise<{ plan: SubscriptionPlan; limits: PlanLimits }> {
    const plan = effectivePlan(await this.getOrCreateSubscription(userId));
    return { plan, limits: getPlanLimits(plan) };
  }

  async countProjects(userId: string): Promise<number> {
    return this.prisma.project.count({ where: ownedBy(userId) });
  }

  async countRepoFiles(userId: string): Promise<number> {
    return this.prisma.repoFile.count({ where: { project: ownedBy(userId) } });
  }

  async countAnalysesThisMonth(userId: string): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    return this.prisma.analysis.count({
      where: { project: ownedBy(userId), createdAt: { gte: startOfMonth } },
    });
  }

  /**
   * Seats used across owned projects: distinct members plus distinct emails with a live pending
   * invitation, so outstanding invites can't oversubscribe the plan once accepted.
   */
  async countSeats(userId: string): Promise<number> {
    const [members, invitations] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: { project: ownedBy(userId) },
        distinct: ["userId"],
        select: { user: { select: { email: true } } },
      }),
      this.prisma.projectInvitation.findMany({
        where: {
          project: ownedBy(userId),
          status: InvitationStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
        distinct: ["email"],
        select: { email: true },
      }),
    ]);

    const emails = new Set(members.map((m) => m.user.email.toLowerCase()));
    for (const invitation of invitations) {
      emails.add(invitation.email.toLowerCase());
    }
    return emails.size;
  }

  /** Revoked tokens are deleted, so only unexpired rows count as active. */
  async countActiveCiTokens(userId: string): Promise<number> {
    return this.prisma.ciToken.count({
      where: { project: ownedBy(userId), expiresAt: { gt: new Date() } },
    });
  }

  async getUsage(userId: string): Promise<PlanUsage> {
    const [projects, repoFiles, analyses, members, ciTokens] = await Promise.all([
      this.countProjects(userId),
      this.countRepoFiles(userId),
      this.countAnalysesThisMonth(userId),
      this.countSeats(userId),
      this.countActiveCiTokens(userId),
    ]);

    return { projects, repoFiles, analyses, members, ciTokens };
  }

  async getSubscriptionResponse(userId: string): Promise<SubscriptionResponse> {
    const subscription = await this.getOrCreateSubscription(userId);
    const usage = await this.getUsage(userId);

    return {
      id: subscription.id,
      plan: subscription.plan,
      status: subscription.status,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      quantity: subscription.quantity,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      isComp: subscription.isComp,
      limits: getPlanLimits(effectivePlan(subscription)),
      usage,
    };
  }
}
