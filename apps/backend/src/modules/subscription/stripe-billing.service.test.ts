import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import type Stripe from "stripe";
import { BadRequestError } from "@/common/errors/http.error";
import type { PrismaClient } from "@/generated/prisma";
import type { DeepMockProxy } from "@/types/deep-mock";
import { StripeBillingService } from "./stripe-billing.service";
import type { SubscriptionService } from "./subscription.service";

mock.module("@/common/logger/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

const PERIOD_END = 1_800_000_000;

const stripeSubscription = {
  items: {
    data: [{ current_period_start: PERIOD_END - 2_592_000, current_period_end: PERIOD_END }],
  },
};

const paidSubscription = {
  userId: "user-1",
  stripeSubscriptionId: "sub_123",
  isComp: false,
  cancelAtPeriodEnd: false,
};

describe("StripeBillingService", () => {
  let prisma: DeepMockProxy<PrismaClient>;
  let stripeUpdate: ReturnType<typeof mock>;
  let service: StripeBillingService;

  beforeEach(() => {
    prisma = {
      subscription: {
        findUnique: mock(() => Promise.resolve(paidSubscription)),
        update: mock(() => Promise.resolve({})),
      },
    } as unknown as DeepMockProxy<PrismaClient>;
    stripeUpdate = mock(() => Promise.resolve(stripeSubscription));

    service = new StripeBillingService(prisma, {} as SubscriptionService);
    spyOn(service, "getStripe").mockReturnValue({
      subscriptions: { update: stripeUpdate },
    } as unknown as Stripe);
  });

  describe("cancelSubscription", () => {
    it("should schedule cancellation in Stripe and mirror it locally", async () => {
      await service.cancelSubscription("user-1");

      expect(stripeUpdate).toHaveBeenCalledWith("sub_123", { cancel_at_period_end: true });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: expect.objectContaining({
          cancelAtPeriodEnd: true,
          currentPeriodEnd: new Date(PERIOD_END * 1000),
        }),
      });
    });

    it("should refuse admin-granted subscriptions without calling Stripe", async () => {
      prisma.subscription.findUnique.mockResolvedValueOnce({ ...paidSubscription, isComp: true });

      await expect(service.cancelSubscription("user-1")).rejects.toBeInstanceOf(BadRequestError);
      expect(stripeUpdate).not.toHaveBeenCalled();
    });
  });

  describe("resumeSubscription", () => {
    it("should clear the scheduled cancellation in Stripe and locally", async () => {
      prisma.subscription.findUnique.mockResolvedValueOnce({
        ...paidSubscription,
        cancelAtPeriodEnd: true,
      });

      await service.resumeSubscription("user-1");

      expect(stripeUpdate).toHaveBeenCalledWith("sub_123", { cancel_at_period_end: false });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: expect.objectContaining({ cancelAtPeriodEnd: false }),
      });
    });

    it("should refuse when no cancellation is scheduled", async () => {
      await expect(service.resumeSubscription("user-1")).rejects.toBeInstanceOf(BadRequestError);
      expect(stripeUpdate).not.toHaveBeenCalled();
    });
  });
});
