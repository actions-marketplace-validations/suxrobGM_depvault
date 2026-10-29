import { inject, injectable } from "@needle-di/core";
import { BadRequestError, NotFoundError } from "@/common/errors/http.error";
import {
  type Prisma,
  PrismaClient,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@/generated/prisma";
import { PLAN_PRICING } from "@/modules/subscription/plan-limits";
import { SubscriptionService } from "@/modules/subscription/subscription.service";
import { paginate, toPage } from "@/types/pagination";
import type {
  AdminSubscriptionListQuery,
  AdminUserListQuery,
  CompSubscriptionBody,
} from "./admin.schema";

const USER_SUMMARY_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  emailVerified: true,
  createdAt: true,
} as const;

@injectable()
export class AdminService {
  constructor(
    private readonly prisma = inject(PrismaClient),
    private readonly subscriptionService = inject(SubscriptionService),
  ) {}

  async listUsers(query: AdminUserListQuery) {
    const { page, limit, search, plan } = query;

    const where: Prisma.UserWhereInput = {
      ...(search && {
        OR: [
          { email: { contains: search, mode: "insensitive" } },
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
        ],
      }),
      ...(plan && { subscription: { plan } }),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          ...USER_SUMMARY_SELECT,
          subscription: {
            select: { plan: true, status: true, isComp: true, currentPeriodEnd: true },
          },
        },
        ...paginate(page, limit),
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.user.count({ where }),
    ]);

    return toPage(users, total, page, limit);
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...USER_SUMMARY_SELECT,
        subscription: {
          select: {
            id: true,
            plan: true,
            status: true,
            isComp: true,
            stripeCustomerId: true,
            stripeSubscriptionId: true,
            quantity: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundError("User not found");

    const usage = await this.subscriptionService.getUsage(userId);

    return { ...user, usage, ownedProjectCount: usage.projects };
  }

  async assignCompSubscription(userId: string, body: CompSubscriptionBody) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");

    const data = { plan: body.plan, status: SubscriptionStatus.ACTIVE, isComp: true };
    await this.prisma.subscription.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });

    return { message: `${body.plan} plan granted to ${user.email}` };
  }

  async revokeCompSubscription(userId: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!subscription) throw new NotFoundError("Subscription not found");
    if (!subscription.isComp) {
      throw new BadRequestError(
        "Subscription was not admin-granted and cannot be revoked this way",
      );
    }

    await this.prisma.subscription.update({
      where: { userId },
      data: {
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        isComp: false,
      },
    });

    return { message: "Subscription reverted to FREE" };
  }

  async listSubscriptions(query: AdminSubscriptionListQuery) {
    const { page, limit, plan, status, isComp } = query;

    const where: Prisma.SubscriptionWhereInput = {
      ...(plan && { plan }),
      ...(status && { status: status as SubscriptionStatus }),
      ...(isComp !== undefined && { isComp }),
    };

    const [subscriptions, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        select: {
          id: true,
          userId: true,
          plan: true,
          status: true,
          isComp: true,
          quantity: true,
          currentPeriodEnd: true,
          createdAt: true,
          user: { select: { email: true, firstName: true, lastName: true } },
        },
        ...paginate(page, limit),
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return toPage(subscriptions, total, page, limit);
  }

  async getStats() {
    const [totalUsers, planCounts, statusCounts, isCompCount, paidSubscriptions] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.subscription.groupBy({
          by: ["plan"],
          _count: { plan: true },
        }),
        this.prisma.subscription.groupBy({
          by: ["status"],
          _count: { status: true },
        }),
        this.prisma.subscription.count({ where: { isComp: true } }),
        this.prisma.subscription.findMany({
          where: {
            plan: { not: SubscriptionPlan.FREE },
            status: SubscriptionStatus.ACTIVE,
            isComp: false,
          },
          select: { plan: true, quantity: true },
        }),
      ]);

    const planBreakdown = { free: 0, pro: 0, team: 0 };
    for (const row of planCounts) {
      const key = row.plan.toLowerCase() as keyof typeof planBreakdown;
      planBreakdown[key] = row._count.plan;
    }

    const activeSubscriptions = statusCounts.find((s) => s.status === "ACTIVE")?._count.status ?? 0;
    const canceledSubscriptions =
      statusCounts.find((s) => s.status === "CANCELED")?._count.status ?? 0;

    const mrr = paidSubscriptions.reduce(
      (sum, s) => sum + (PLAN_PRICING[s.plan] / 100) * s.quantity,
      0,
    );

    return {
      totalUsers,
      planBreakdown,
      activeSubscriptions,
      canceledSubscriptions,
      isCompCount,
      mrr,
    };
  }
}
