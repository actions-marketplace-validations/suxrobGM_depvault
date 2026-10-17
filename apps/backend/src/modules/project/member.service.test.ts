import "reflect-metadata";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/common/errors/http.error";
import type { PrismaClient } from "@/generated/prisma";
import type { AuditLogService } from "@/modules/audit-log";
import type { NotificationService } from "@/modules/notification/notification.service";
import type { PlanEnforcementService } from "@/modules/subscription/plan-enforcement.service";
import type { DeepMockProxy } from "@/types/deep-mock";
import { MemberService } from "./member.service";

const now = new Date();

const mockMember = {
  id: "member-uuid",
  projectId: "project-uuid",
  userId: "invitee-uuid",
  role: "EDITOR",
  createdAt: now,
  updatedAt: now,
  user: {
    id: "invitee-uuid",
    email: "invitee@example.com",
    firstName: "Invitee",
    lastName: "User",
    avatarUrl: null,
  },
};

const ownerMembership = {
  id: "owner-member-uuid",
  projectId: "project-uuid",
  userId: "owner-uuid",
  role: "OWNER",
  createdAt: now,
  updatedAt: now,
};

function createMockPrisma() {
  return {
    user: {
      findFirst: mock(() => Promise.resolve(null)),
      findUnique: mock(() => Promise.resolve(null)),
    },
    project: {
      findUnique: mock(() => Promise.resolve({ name: "Test Project" })),
      update: mock(() => Promise.resolve({})),
    },
    projectMember: {
      findUnique: mock(() => Promise.resolve(null)),
      findFirst: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      create: mock(() => Promise.resolve(mockMember)),
      update: mock(() => Promise.resolve(mockMember)),
      delete: mock(() => Promise.resolve(mockMember)),
      count: mock(() => Promise.resolve(0)),
    },
    projectKeyGrant: {
      deleteMany: mock(() => Promise.resolve({ count: 0 })),
    },
    ciToken: {
      deleteMany: mock(() => Promise.resolve({ count: 0 })),
    },
    $transaction: mock((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as DeepMockProxy<PrismaClient>;
}

const actor = { userId: "owner-uuid", ipAddress: "127.0.0.1" };

describe("MemberService", () => {
  let service: MemberService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let planEnforcement: DeepMockProxy<PlanEnforcementService>;
  let audit: DeepMockProxy<AuditLogService>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    planEnforcement = {
      enforce: mock(() => Promise.resolve()),
    } as unknown as DeepMockProxy<PlanEnforcementService>;
    audit = { log: mock(() => Promise.resolve()) } as unknown as DeepMockProxy<AuditLogService>;
    service = new MemberService(
      mockPrisma,
      { notify: mock(() => Promise.resolve()) } as unknown as NotificationService,
      planEnforcement as unknown as PlanEnforcementService,
      audit as unknown as AuditLogService,
    );
  });

  describe("list", () => {
    it("should return paginated members", async () => {
      mockPrisma.projectMember.findMany.mockResolvedValueOnce([mockMember]);
      mockPrisma.projectMember.count.mockResolvedValueOnce(1);

      const result = await service.list("project-uuid", 1, 20);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.userId).toBe("invitee-uuid");
      expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    });
  });

  describe("updateRole", () => {
    it("should update the role and audit the change", async () => {
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        ...mockMember,
        role: "VIEWER",
      });
      mockPrisma.projectMember.update.mockResolvedValueOnce({
        ...mockMember,
        role: "EDITOR",
      });

      const result = await service.updateRole(
        "project-uuid",
        "member-uuid",
        { role: "EDITOR" },
        actor,
      );

      expect(result.role).toBe("EDITOR");
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "UPDATE",
          resourceType: "PROJECT_MEMBER",
          metadata: { oldRole: "VIEWER", newRole: "EDITOR" },
        }),
      );
    });

    it("should throw NotFoundError when target member not found", async () => {
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(null);

      expect(
        service.updateRole("project-uuid", "nonexistent", { role: "EDITOR" }, actor),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("should throw ForbiddenError when trying to change owner role", async () => {
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        ...ownerMembership,
        id: "other-owner-member",
        role: "OWNER",
      });

      expect(
        service.updateRole("project-uuid", "other-owner-member", { role: "EDITOR" }, actor),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("remove", () => {
    it("should remove the member and revoke their key grants and CI tokens", async () => {
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(mockMember);

      const result = await service.remove("project-uuid", "member-uuid", actor);

      expect(result.message).toBe("Member removed successfully");
      expect(mockPrisma.projectMember.delete).toHaveBeenCalledWith({
        where: { id: "member-uuid" },
      });
      expect(mockPrisma.projectKeyGrant.deleteMany).toHaveBeenCalledWith({
        where: { projectId: "project-uuid", userId: mockMember.userId },
      });
      expect(mockPrisma.ciToken.deleteMany).toHaveBeenCalledWith({
        where: { projectId: "project-uuid", createdBy: mockMember.userId },
      });
    });

    it("should throw ForbiddenError when trying to remove owner", async () => {
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce({
        ...ownerMembership,
        role: "OWNER",
      });

      expect(service.remove("project-uuid", "owner-member-uuid", actor)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });

    it("should throw NotFoundError when target member not found", async () => {
      mockPrisma.projectMember.findFirst.mockResolvedValueOnce(null);

      expect(service.remove("project-uuid", "nonexistent", actor)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe("transferOwnership", () => {
    it("should transfer ownership to another member", async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValueOnce({
        ...mockMember,
        id: "new-owner-member-uuid",
      });

      const result = await service.transferOwnership(
        "project-uuid",
        { newOwnerId: "invitee-uuid" },
        "owner-member-uuid",
        actor,
      );

      expect(result.message).toBe("Ownership transferred successfully");
      expect(planEnforcement.enforce).toHaveBeenCalledWith("invitee-uuid", "project");
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("should refuse when the new owner is at their project limit", async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValueOnce(mockMember);
      planEnforcement.enforce.mockRejectedValueOnce(new ForbiddenError("limit"));

      await expect(
        service.transferOwnership(
          "project-uuid",
          { newOwnerId: "invitee-uuid" },
          "owner-member-uuid",
          actor,
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("should throw BadRequestError when transferring to yourself", async () => {
      expect(
        service.transferOwnership(
          "project-uuid",
          { newOwnerId: "owner-uuid" },
          "owner-member-uuid",
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("should throw NotFoundError when target is not a member", async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValueOnce(null);

      expect(
        service.transferOwnership(
          "project-uuid",
          { newOwnerId: "outsider-uuid" },
          "owner-member-uuid",
          actor,
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
