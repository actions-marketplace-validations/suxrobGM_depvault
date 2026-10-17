import { mock } from "bun:test";
import type { PrismaClient } from "@/generated/prisma";
import type { AuditLogService } from "@/modules/audit-log";
import { RepoFileRepository } from "@/modules/repo-file/repo-file.repository";
import type { PlanEnforcementService } from "@/modules/subscription/plan-enforcement.service";
import type { DeepMockProxy } from "@/types/deep-mock";
import { CiTokenService } from "./ci-token.service";

mock.module("@/common/logger/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

export const baseCiToken = {
  id: "token-uuid",
  projectId: "project-uuid",
  createdBy: "user-uuid",
  name: "GitHub Actions Prod",
  tokenHash: "hash",
  tokenPrefix: "abcd1234",
  paths: [] as string[],
  ipAllowlist: [] as string[],
  wrappedDek: "wrapped-dek",
  wrappedDekIv: "wrapped-iv",
  wrappedDekTag: "wrapped-tag",
  lastUsedAt: null,
  expiresAt: new Date(Date.now() + 86400_000),
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createMockPrisma() {
  return {
    ciToken: {
      create: mock(() => Promise.resolve({ ...baseCiToken })),
      findMany: mock(() => Promise.resolve([])),
      findFirst: mock(() => Promise.resolve({ ...baseCiToken })),
      findUnique: mock(() => Promise.resolve({ ...baseCiToken })),
      update: mock(() => Promise.resolve({ ...baseCiToken })),
      delete: mock(() => Promise.resolve({ ...baseCiToken })),
      count: mock(() => Promise.resolve(0)),
    },
    repoFile: {
      findMany: mock(() => Promise.resolve([])),
    },
  } as unknown as DeepMockProxy<PrismaClient>;
}

/** A CiTokenService over a mock Prisma (with the real repo-file repository) and mock services. */
export function createCiTokenService() {
  const prisma = createMockPrisma();
  const audit = { log: mock(() => Promise.resolve()) } as unknown as DeepMockProxy<AuditLogService>;
  const planEnforcement = {
    enforceForProject: mock(() => Promise.resolve()),
    enforceFeatureForProject: mock(() => Promise.resolve()),
  } as unknown as DeepMockProxy<PlanEnforcementService>;

  const service = new CiTokenService(
    prisma,
    audit as unknown as AuditLogService,
    planEnforcement as unknown as PlanEnforcementService,
    new RepoFileRepository(prisma),
  );
  return { service, prisma, audit, planEnforcement };
}
