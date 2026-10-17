import "reflect-metadata";
import { describe, expect, it, mock } from "bun:test";
import { PlanLimitError } from "@/common/errors/http.error";
import type { PrismaClient } from "@/generated/prisma";
import { PlanEnforcementService } from "./plan-enforcement.service";
import { getPlanLimits } from "./plan-limits";
import type { SubscriptionService } from "./subscription.service";

type CounterName =
  | "countProjects"
  | "countRepoFiles"
  | "countAnalysesThisMonth"
  | "countSeats"
  | "countActiveCiTokens";

function createService(
  plan: "FREE" | "TEAM" = "FREE",
  counts: Partial<Record<CounterName, number>> = {},
) {
  const count = (name: CounterName) => mock(() => Promise.resolve(counts[name] ?? 0));
  const subscriptions = {
    getUserPlan: mock(() => Promise.resolve({ plan, limits: getPlanLimits(plan) })),
    countProjects: count("countProjects"),
    countRepoFiles: count("countRepoFiles"),
    countAnalysesThisMonth: count("countAnalysesThisMonth"),
    countSeats: count("countSeats"),
    countActiveCiTokens: count("countActiveCiTokens"),
  };
  const prisma = {
    projectMember: {
      findFirst: mock(() => Promise.resolve({ userId: "owner-1" })),
    },
  };
  const service = new PlanEnforcementService(
    prisma as unknown as PrismaClient,
    subscriptions as unknown as SubscriptionService,
  );
  return { service, subscriptions, prisma };
}

// FREE limits: 3 projects, 100 files, 30 analyses/month, 1 seat, 5 CI tokens.
const LIMITS = [
  ["project", "countProjects", 3],
  ["repoFile", "countRepoFiles", 100],
  ["analysis", "countAnalysesThisMonth", 30],
  ["member", "countSeats", 1],
  ["ciToken", "countActiveCiTokens", 5],
] as const;

describe("PlanEnforcementService", () => {
  describe("enforce", () => {
    it.each(LIMITS)("should allow %s one below the limit", async (type, counter, max) => {
      const { service } = createService("FREE", { [counter]: max - 1 });

      expect(service.enforce("owner-1", type)).resolves.toBeUndefined();
    });

    it.each(LIMITS)("should reject %s at the limit", async (type, counter, max) => {
      const { service } = createService("FREE", { [counter]: max });

      expect(service.enforce("owner-1", type)).rejects.toBeInstanceOf(PlanLimitError);
    });

    it("should skip counting on unlimited plans", async () => {
      const { service, subscriptions } = createService("TEAM", { countProjects: 999 });

      await service.enforce("owner-1", "project");

      expect(subscriptions.countProjects).not.toHaveBeenCalled();
    });

    it("should account for several items added at once", async () => {
      const { service } = createService("FREE", { countRepoFiles: 95 });

      expect(service.enforce("owner-1", "repoFile", 5)).resolves.toBeUndefined();
      expect(service.enforce("owner-1", "repoFile", 6)).rejects.toBeInstanceOf(PlanLimitError);
    });

    it("should re-check without adding when adding is 0", async () => {
      const { service } = createService("FREE", { countSeats: 1 });

      expect(service.enforce("owner-1", "member", 0)).resolves.toBeUndefined();
    });

    it("should include count and limit in the error message", async () => {
      const { service } = createService("FREE", { countProjects: 5 });

      expect(service.enforce("owner-1", "project")).rejects.toThrow("(5/3)");
    });
  });

  describe("enforceForProject", () => {
    it("should enforce against the project owner's plan", async () => {
      const { service, prisma, subscriptions } = createService();

      await service.enforceForProject("project-1", "ciToken");

      expect(prisma.projectMember.findFirst).toHaveBeenCalledWith({
        where: { projectId: "project-1", role: "OWNER" },
        select: { userId: true },
      });
      expect(subscriptions.getUserPlan).toHaveBeenCalledWith("owner-1");
      expect(subscriptions.countActiveCiTokens).toHaveBeenCalledWith("owner-1");
    });
  });

  describe("enforceFeatureForProject", () => {
    it.each([
      ["FREE", "secretSharing", true],
      ["FREE", "gitSecretScanning", false],
      ["TEAM", "ipAllowlists", true],
    ] as const)("on %s should allow %s: %p", async (plan, feature, allowed) => {
      const { service } = createService(plan);
      const result = service.enforceFeatureForProject("project-1", feature);

      if (allowed) {
        expect(result).resolves.toBeUndefined();
      } else {
        expect(result).rejects.toBeInstanceOf(PlanLimitError);
      }
    });
  });
});
