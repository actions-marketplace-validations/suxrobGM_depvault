import { beforeEach, describe, expect, it, mock } from "bun:test";
import { ConflictError, NotFoundError } from "@/common/errors/http.error";
import { LicensePolicy, type PrismaClient } from "@/generated/prisma";
import type { DeepMockProxy } from "@/types/deep-mock";
import { LicenseRuleService } from "./license-rule.service";

const now = new Date();
const PROJECT_ID = "project-uuid";
const RULE_ID = "rule-uuid";

const mockRule = {
  id: RULE_ID,
  projectId: PROJECT_ID,
  licenseId: "MIT",
  policy: "ALLOW",
  createdAt: now,
  updatedAt: now,
};

function createMockPrisma() {
  return {
    licenseRule: {
      findMany: mock(() => Promise.resolve([mockRule])),
      findUnique: mock(() => Promise.resolve(null)),
      findFirst: mock(() => Promise.resolve(null)),
      create: mock(() => Promise.resolve(mockRule)),
      update: mock(() => Promise.resolve(mockRule)),
      delete: mock(() => Promise.resolve(mockRule)),
    },
    dependency: {
      findMany: mock(() => Promise.resolve([])),
      count: mock(() => Promise.resolve(0)),
      groupBy: mock(() => Promise.resolve([])),
    },
  } as unknown as DeepMockProxy<PrismaClient>;
}

describe("LicenseRuleService", () => {
  let service: LicenseRuleService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new LicenseRuleService(prisma);
  });

  describe("list", () => {
    it("should return all rules for the project", async () => {
      const result = await service.list(PROJECT_ID);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.licenseId).toBe("MIT");
      expect(prisma.licenseRule.findMany).toHaveBeenCalledWith({
        where: { projectId: PROJECT_ID },
        orderBy: { licenseId: "asc" },
      });
    });
  });

  describe("create", () => {
    it("should create a license rule", async () => {
      const result = await service.create(PROJECT_ID, {
        licenseId: "MIT",
        policy: LicensePolicy.ALLOW,
      });

      expect(result.id).toBe(RULE_ID);
      expect(prisma.licenseRule.create).toHaveBeenCalledWith({
        data: { projectId: PROJECT_ID, licenseId: "MIT", policy: "ALLOW" },
      });
    });

    it("should throw ConflictError when rule already exists", async () => {
      prisma.licenseRule.findUnique.mockResolvedValueOnce(mockRule);

      expect(
        service.create(PROJECT_ID, { licenseId: "MIT", policy: LicensePolicy.ALLOW }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe("update", () => {
    it("should update a rule policy", async () => {
      prisma.licenseRule.findFirst.mockResolvedValueOnce(mockRule);

      const result = await service.update(PROJECT_ID, RULE_ID, {
        policy: LicensePolicy.BLOCK,
      });

      expect(result.id).toBe(RULE_ID);
      expect(prisma.licenseRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: { policy: "BLOCK" },
      });
    });

    it("should throw NotFoundError when rule does not exist", async () => {
      expect(
        service.update(PROJECT_ID, RULE_ID, { policy: LicensePolicy.BLOCK }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("delete", () => {
    it("should delete a rule", async () => {
      prisma.licenseRule.findFirst.mockResolvedValueOnce(mockRule);

      const result = await service.delete(PROJECT_ID, RULE_ID);

      expect(result.message).toBe("License rule deleted successfully");
      expect(prisma.licenseRule.delete).toHaveBeenCalledWith({ where: { id: RULE_ID } });
    });

    it("should throw NotFoundError when rule does not exist", async () => {
      expect(service.delete(PROJECT_ID, RULE_ID)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("getComplianceSummary", () => {
    const pageDeps = [
      {
        name: "express",
        license: "MIT",
        licensePolicy: "ALLOW",
        analysis: { fileName: "package.json" },
      },
      {
        name: "lodash",
        license: "Apache-2.0",
        licensePolicy: "ALLOW",
        analysis: { fileName: "package.json" },
      },
    ];

    it("should count dependencies per policy, treating a missing license as unknown", async () => {
      prisma.dependency.groupBy.mockResolvedValueOnce([
        { licensePolicy: "ALLOW", _count: 2 },
        { licensePolicy: "WARN", _count: 1 },
        { licensePolicy: "BLOCK", _count: 1 },
      ]);
      prisma.dependency.count.mockResolvedValueOnce(1).mockResolvedValueOnce(5);

      const result = await service.getComplianceSummary(PROJECT_ID);

      expect(result).toMatchObject({ total: 5, allowed: 2, warned: 1, blocked: 1, unknown: 1 });
    });

    it("should return one page of dependencies with pagination", async () => {
      prisma.dependency.findMany.mockResolvedValueOnce(pageDeps);
      prisma.dependency.count.mockResolvedValueOnce(0).mockResolvedValueOnce(5);

      const result = await service.getComplianceSummary(PROJECT_ID, 2, 2);

      expect(result.dependencies[0]).toEqual({
        name: "express",
        license: "MIT",
        licensePolicy: "ALLOW",
        analysisFileName: "package.json",
      });
      expect(result.pagination).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
      expect(prisma.dependency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 2, take: 2 }),
      );
    });

    it.each([
      ["a search term", "express", true],
      ["no search term", undefined, false],
    ])("should filter by name or license only with %s", async (_, search, filtered) => {
      await service.getComplianceSummary(PROJECT_ID, 1, 25, search);

      const where = prisma.dependency.findMany.mock.calls[0]![0]!.where;
      expect(where?.OR !== undefined).toBe(filtered);
    });
  });

  describe("exportReport", () => {
    it("should export every dependency, not just the first page", async () => {
      await service.exportReport(PROJECT_ID, "csv");

      expect(prisma.dependency.findMany.mock.calls[0]![0]).not.toHaveProperty("take");
    });

    it("should generate a CSV report with escaped quotes", async () => {
      prisma.dependency.findMany.mockResolvedValueOnce([
        {
          name: 'pkg-"q"',
          license: "MIT",
          licensePolicy: "ALLOW",
          analysis: { fileName: "package.json" },
        },
      ]);

      const result = await service.exportReport(PROJECT_ID, "csv");

      expect(result.contentType).toBe("text/csv");
      expect(result.content).toContain("Dependency,License,Policy,Analysis File");
      expect(result.content).toContain('pkg-""q""');
    });

    it("should generate a plain-text report", async () => {
      prisma.dependency.findMany.mockResolvedValueOnce([
        {
          name: "express",
          license: null,
          licensePolicy: "ALLOW",
          analysis: { fileName: "package.json" },
        },
      ]);

      const result = await service.exportReport(PROJECT_ID, "txt");

      expect(result.contentType).toBe("text/plain");
      expect(result.fileName).toBe("license-audit-report.txt");
      expect(result.content).toContain("express | Unknown | ALLOW | package.json");
    });
  });
});
