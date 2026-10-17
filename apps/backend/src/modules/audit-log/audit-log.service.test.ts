import "reflect-metadata";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { PrismaClient } from "@/generated/prisma";
import type { DeepMockProxy } from "@/types/deep-mock";
import { AuditLogService } from "./audit-log.service";

const now = new Date();
const projectId = "project-uuid";
const userId = "user-uuid";
const resourceId = "resource-uuid";

const mockAuditLog = {
  id: "audit-uuid",
  userId,
  projectId,
  action: "READ" as const,
  resourceType: "REPO_FILE" as const,
  resourceId,
  ipAddress: "127.0.0.1",
  metadata: null,
  createdAt: now,
  user: { email: "test@test.com", firstName: "Test", lastName: "User", avatarUrl: null },
  project: { name: "Project" },
};

function createMockPrisma() {
  return {
    auditLog: {
      create: mock(() => Promise.resolve(mockAuditLog)),
      findMany: mock(() => Promise.resolve([mockAuditLog])),
      count: mock(() => Promise.resolve(1)),
    },
  } as unknown as DeepMockProxy<PrismaClient>;
}

describe("AuditLogService", () => {
  let service: AuditLogService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new AuditLogService(mockPrisma);
  });

  describe("log", () => {
    it("should create an audit log entry", async () => {
      await service.log({
        userId,
        projectId,
        action: "READ",
        resourceType: "REPO_FILE",
        resourceId,
        ipAddress: "127.0.0.1",
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          projectId,
          action: "READ",
          resourceType: "REPO_FILE",
          resourceId,
          ipAddress: "127.0.0.1",
        }),
      });
    });

    it("should not throw when creation fails", async () => {
      mockPrisma.auditLog.create.mockRejectedValueOnce(new Error("DB error"));

      expect(
        service.log({
          userId,
          projectId,
          action: "READ",
          resourceType: "REPO_FILE",
          resourceId,
          ipAddress: "127.0.0.1",
        }),
      ).resolves.toBeUndefined();
    });

    it("should accept optional metadata", async () => {
      await service.log({
        userId,
        projectId,
        action: "UPDATE",
        resourceType: "REPO_FILE",
        resourceId,
        ipAddress: "192.168.1.1",
        metadata: { key: "DATABASE_URL" },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: { key: "DATABASE_URL" },
        }),
      });
    });
  });

  describe("list", () => {
    it("should map logs with author details into a page", async () => {
      const result = await service.list(projectId, {}, 1, 20);

      expect(result.items[0]).toMatchObject({
        id: "audit-uuid",
        userEmail: "test@test.com",
        userFirstName: "Test",
        userLastName: "User",
        userAvatarUrl: null,
        projectName: "Project",
      });
      expect(result.pagination.total).toBe(1);
    });

    it("should report a deleted author as null fields", async () => {
      mockPrisma.auditLog.findMany.mockResolvedValueOnce([
        { ...mockAuditLog, userId: null, user: null },
      ]);

      const result = await service.list(projectId, {}, 1, 20);

      expect(result.items[0]).toMatchObject({ userId: null, userEmail: null });
    });

    const from = "2026-01-01T00:00:00.000Z";
    const to = "2026-01-31T23:59:59.999Z";

    it.each([
      ["action", { action: "DELETE" as const }, { action: "DELETE" }],
      ["resourceType", { resourceType: "REPO_FILE" as const }, { resourceType: "REPO_FILE" }],
      ["date range", { from, to }, { createdAt: { gte: new Date(from), lte: new Date(to) } }],
      ["start date only", { from }, { createdAt: { gte: new Date(from) } }],
      [
        "userEmail (case-insensitive partial match)",
        { userEmail: "test@" },
        { user: { email: { contains: "test@", mode: "insensitive" } } },
      ],
    ])("should filter by %s", async (_, filters, expected) => {
      await service.list(projectId, filters, 1, 20);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ projectId, ...expected }) }),
      );
    });
  });

  describe("listGlobal", () => {
    it("should only include projects where the user is an owner or editor", async () => {
      await service.listGlobal(userId, {}, 1, 20);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            project: { members: { some: { userId, role: { in: ["OWNER", "EDITOR"] } } } },
          },
        }),
      );
    });
  });
});
