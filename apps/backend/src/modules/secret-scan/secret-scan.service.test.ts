import "reflect-metadata";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { BadRequestError, ConflictError } from "@/common/errors/http.error";
import { Prisma, type PrismaClient, ScanStatus } from "@/generated/prisma";
import type { PlanEnforcementService } from "@/modules/subscription/plan-enforcement.service";
import type { DeepMockProxy } from "@/types/deep-mock";
import type { SecretScanExecutor } from "./secret-scan.executor";
import { SecretScanService } from "./secret-scan.service";

const REPO_URL = "https://github.com/acme/app";

const scanRow = {
  id: "scan-uuid",
  projectId: "project-uuid",
  triggeredById: "user-uuid",
  status: ScanStatus.PENDING,
  commitsScanned: 0,
  detectionsFound: 0,
  startedAt: null,
  completedAt: null,
  errorMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createService() {
  const prisma = {
    secretScan: {
      create: mock(() => Promise.resolve({ ...scanRow })),
      updateMany: mock(() => Promise.resolve({ count: 0 })),
    },
    project: {
      findUnique: mock(() => Promise.resolve({ repositoryUrl: REPO_URL })),
    },
  } as unknown as DeepMockProxy<PrismaClient>;
  const executor = { execute: mock(() => Promise.resolve()) };
  const planEnforcement = { enforceFeatureForProject: mock(() => Promise.resolve()) };

  const service = new SecretScanService(
    prisma,
    executor as unknown as SecretScanExecutor,
    planEnforcement as unknown as PlanEnforcementService,
  );
  return { service, prisma, executor, planEnforcement };
}

describe("SecretScanService", () => {
  let ctx: ReturnType<typeof createService>;

  beforeEach(() => {
    ctx = createService();
  });

  describe("triggerScan", () => {
    it("should check the plan, create a pending scan and start the executor", async () => {
      const result = await ctx.service.triggerScan("project-uuid", "user-uuid");

      expect(result.id).toBe("scan-uuid");
      expect(ctx.planEnforcement.enforceFeatureForProject).toHaveBeenCalledWith(
        "project-uuid",
        "gitSecretScanning",
      );
      expect(ctx.executor.execute).toHaveBeenCalledWith(
        expect.objectContaining({ scanId: "scan-uuid", owner: "acme", repo: "app" }),
      );
    });
  });

  describe("startScan", () => {
    it("should fail abandoned active scans before creating a new one", async () => {
      await ctx.service.startScan("project-uuid", "user-uuid", REPO_URL);

      expect(ctx.prisma.secretScan.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ projectId: "project-uuid" }),
          data: expect.objectContaining({ status: ScanStatus.FAILED }),
        }),
      );
    });

    it("should throw ConflictError when another scan is already active", async () => {
      ctx.prisma.secretScan.create.mockImplementation(() =>
        Promise.reject(
          new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "test",
          }),
        ),
      );

      expect(ctx.service.startScan("project-uuid", "user-uuid", REPO_URL)).rejects.toBeInstanceOf(
        ConflictError,
      );
    });

    it.each([
      ["no repository is connected", null],
      ["the repository URL is not GitHub", "https://example.com/acme/app"],
    ])("should throw BadRequestError when %s", async (_, url) => {
      expect(ctx.service.startScan("project-uuid", "user-uuid", url)).rejects.toBeInstanceOf(
        BadRequestError,
      );
      expect(ctx.prisma.secretScan.create).not.toHaveBeenCalled();
    });
  });
});
