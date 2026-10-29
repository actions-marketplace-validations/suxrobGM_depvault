import { beforeEach, describe, expect, it, mock } from "bun:test";
import { ForbiddenError } from "@/common/errors/http.error";
import type { PrismaClient } from "@/generated/prisma";
import type { PlanEnforcementService } from "@/modules/subscription/plan-enforcement.service";
import type { DeepMockProxy } from "@/types/deep-mock";
import { ProjectService } from "./project.service";

const now = new Date();

const mockProject = {
  id: "project-uuid",
  name: "Test Project",
  description: "A test project",
  repositoryUrl: null,
  createdAt: now,
  updatedAt: now,
};

function createMockPrisma() {
  return {
    project: {
      create: mock(() => Promise.resolve(mockProject)),
      findMany: mock(() => Promise.resolve([{ ...mockProject, members: [{ role: "OWNER" }] }])),
      findUniqueOrThrow: mock(() => Promise.resolve(mockProject)),
      count: mock(() => Promise.resolve(1)),
      update: mock(() => Promise.resolve({ ...mockProject, name: "Updated" })),
      delete: mock(() => Promise.resolve(mockProject)),
    },
  } as unknown as DeepMockProxy<PrismaClient>;
}

describe("ProjectService", () => {
  let service: ProjectService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let planEnforcement: DeepMockProxy<PlanEnforcementService>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    planEnforcement = {
      enforce: mock(() => Promise.resolve()),
    } as unknown as DeepMockProxy<PlanEnforcementService>;
    service = new ProjectService(mockPrisma, planEnforcement as unknown as PlanEnforcementService);
  });

  describe("create", () => {
    it("should create the project with the creator as its OWNER member", async () => {
      const result = await service.create({ name: "Test Project" }, "user-uuid");

      expect(result).toMatchObject({ id: "project-uuid", currentUserRole: "OWNER" });
      expect(planEnforcement.enforce).toHaveBeenCalledWith("user-uuid", "project");
      expect(mockPrisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Test Project",
            members: { create: { userId: "user-uuid", role: "OWNER" } },
          }),
        }),
      );
    });

    it("should not create the project when the plan limit is reached", async () => {
      planEnforcement.enforce.mockRejectedValueOnce(new ForbiddenError("limit"));

      expect(service.create({ name: "Over" }, "user-uuid")).rejects.toBeInstanceOf(ForbiddenError);
      expect(mockPrisma.project.create).not.toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("should return the user's projects with their role and pagination", async () => {
      mockPrisma.project.count.mockResolvedValueOnce(25);

      const result = await service.list("user-uuid", 2, 10);

      expect(result.items[0]).toMatchObject({ name: "Test Project", currentUserRole: "OWNER" });
      expect(result.pagination).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { members: { some: { userId: "user-uuid" } } },
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe("getById", () => {
    it("should return the project with the caller's role", async () => {
      const result = await service.getById("project-uuid", "EDITOR");

      expect(result).toMatchObject({ id: "project-uuid", currentUserRole: "EDITOR" });
    });
  });

  describe("update", () => {
    it("should only update provided fields", async () => {
      const result = await service.update("project-uuid", { name: "New Name" }, "OWNER");

      expect(result.currentUserRole).toBe("OWNER");
      expect(mockPrisma.project.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "project-uuid" }, data: { name: "New Name" } }),
      );
    });
  });

  describe("delete", () => {
    it("should delete the project", async () => {
      const result = await service.delete("project-uuid");

      expect(result.message).toBe("Project deleted successfully");
      expect(mockPrisma.project.delete).toHaveBeenCalledWith({ where: { id: "project-uuid" } });
    });
  });
});
