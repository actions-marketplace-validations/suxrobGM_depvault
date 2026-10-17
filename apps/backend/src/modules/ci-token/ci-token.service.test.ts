import "reflect-metadata";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/common/errors/http.error";
import type { PrismaClient } from "@/generated/prisma";
import type { AuditLogService } from "@/modules/audit-log";
import { RepoFileRepository } from "@/modules/repo-file/repo-file.repository";
import type { PlanEnforcementService } from "@/modules/subscription/plan-enforcement.service";
import type { DeepMockProxy } from "@/types/deep-mock";
import { CiTokenService } from "./ci-token.service";

mock.module("@/common/logger/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

const baseProjectMember = {
  id: "member-uuid",
  projectId: "project-uuid",
  userId: "user-uuid",
  role: "OWNER",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseCiToken = {
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
    projectMember: {
      findUnique: mock(() => Promise.resolve({ ...baseProjectMember })),
    },
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

function createMockAuditLogService() {
  return {
    log: mock(() => Promise.resolve()),
  } as unknown as AuditLogService;
}

let mockPrisma: ReturnType<typeof createMockPrisma>;
let mockAudit: ReturnType<typeof createMockAuditLogService>;
let mockPlanEnforcement: DeepMockProxy<PlanEnforcementService>;
let service: CiTokenService;

beforeEach(() => {
  mockPrisma = createMockPrisma();
  mockAudit = createMockAuditLogService();
  mockPlanEnforcement = {
    enforceForProject: mock(() => Promise.resolve()),
    enforceFeatureForProject: mock(() => Promise.resolve()),
  } as unknown as DeepMockProxy<PlanEnforcementService>;
  service = new CiTokenService(
    mockPrisma,
    mockAudit,
    mockPlanEnforcement as unknown as PlanEnforcementService,
    new RepoFileRepository(mockPrisma),
  );
});

describe("CiTokenService", () => {
  describe("create", () => {
    const body = {
      name: "GitHub Actions Prod",
      paths: ["deploy/**", "deploy/**"],
      tokenHash: "a".repeat(64),
      tokenPrefix: "abcd1234",
      wrappedDek: "wrapped-dek",
      wrappedDekIv: "wrapped-iv",
      wrappedDekTag: "wrapped-tag",
      expiresIn: 86400,
    };

    it("should store client-sent fields verbatim and dedupe paths without returning the token", async () => {
      const result = await service.create("project-uuid", "user-uuid", body, "127.0.0.1");

      expect(result).not.toHaveProperty("token");
      expect(result.tokenPrefix).toHaveLength(8);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockPrisma.ciToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tokenHash: body.tokenHash,
            tokenPrefix: body.tokenPrefix,
            paths: ["deploy/**"],
            wrappedDek: "wrapped-dek",
            wrappedDekIv: "wrapped-iv",
            wrappedDekTag: "wrapped-tag",
          }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it("should reject path globs that are not repo-relative", async () => {
      expect(
        service.create("project-uuid", "user-uuid", { ...body, paths: ["/etc/**"] }, "127.0.0.1"),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("should require the ipAllowlists plan feature when an allowlist is set", async () => {
      await service.create(
        "project-uuid",
        "user-uuid",
        { ...body, ipAllowlist: ["10.0.0.0/8"] },
        "127.0.0.1",
      );

      expect(mockPlanEnforcement.enforceFeatureForProject).toHaveBeenCalledWith(
        "project-uuid",
        "ipAllowlists",
      );
    });

    it("should throw BadRequestError for invalid IP allowlist", async () => {
      expect(
        service.create(
          "project-uuid",
          "user-uuid",
          { ...body, ipAllowlist: ["not-an-ip"] },
          "127.0.0.1",
        ),
      ).rejects.toBeInstanceOf(BadRequestError);
    });
  });

  describe("list", () => {
    it("should return a paginated token list with path scopes", async () => {
      const tokenWithRelations = {
        ...baseCiToken,
        paths: ["deploy/**"],
        creator: { email: "user@test.com" },
      };
      mockPrisma.ciToken.findMany.mockResolvedValueOnce([tokenWithRelations]);
      mockPrisma.ciToken.count.mockResolvedValueOnce(1);

      const result = await service.list("project-uuid");

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.paths).toEqual(["deploy/**"]);
      expect(result.pagination.total).toBe(1);
    });
  });

  describe("revoke", () => {
    it("should delete the token", async () => {
      const result = await service.revoke("project-uuid", "token-uuid", "user-uuid", "127.0.0.1");

      expect(result.message).toBe("CI token deleted");
      expect(mockPrisma.ciToken.delete).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it("should throw NotFoundError when token not found", async () => {
      mockPrisma.ciToken.findFirst.mockResolvedValueOnce(null);

      expect(
        service.revoke("project-uuid", "token-uuid", "user-uuid", "127.0.0.1"),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("validateToken", () => {
    it("should return token when valid", async () => {
      const result = await service.validateToken("dvci_sometoken", "127.0.0.1");

      expect(result.id).toBe("token-uuid");
      expect(mockPrisma.ciToken.update).toHaveBeenCalled();
    });

    it("should throw UnauthorizedError when token not found", async () => {
      mockPrisma.ciToken.findUnique.mockResolvedValueOnce(null);

      expect(service.validateToken("dvci_bad", "127.0.0.1")).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it("should reject a full split token (old CLI sent the key part)", async () => {
      expect(service.validateToken("dvci_auth.keypart", "127.0.0.1")).rejects.toThrow(
        /Upgrade the DepVault CLI/,
      );
      expect(mockPrisma.ciToken.findUnique).not.toHaveBeenCalled();
    });

    it("should throw UnauthorizedError when token is expired", async () => {
      mockPrisma.ciToken.findUnique.mockResolvedValueOnce({
        ...baseCiToken,
        expiresAt: new Date(Date.now() - 1000),
      });

      expect(service.validateToken("dvci_expired", "127.0.0.1")).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it("should throw ForbiddenError when IP not in allowlist", async () => {
      mockPrisma.ciToken.findUnique.mockResolvedValueOnce({
        ...baseCiToken,
        ipAllowlist: ["10.0.0.1"],
      });

      expect(service.validateToken("dvci_token", "192.168.1.1")).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });

    it("should allow IP in allowlist", async () => {
      mockPrisma.ciToken.findUnique.mockResolvedValueOnce({
        ...baseCiToken,
        ipAllowlist: ["10.0.0.0/8"],
      });

      const result = await service.validateToken("dvci_token", "10.1.2.3");
      expect(result.id).toBe("token-uuid");
    });
  });

  describe("fetchFiles", () => {
    const file = (path: string) => ({
      id: `id-${path}`,
      path,
      encryptedContent: Buffer.from("cipher"),
      iv: "iv",
      authTag: "tag",
      isBinary: false,
    });

    it("should return the wrapped DEK and every project file when the token has no path globs", async () => {
      mockPrisma.repoFile.findMany.mockResolvedValueOnce([file(".env"), file("deploy/.env")]);

      const result = await service.fetchFiles({ ...baseCiToken }, "run-1", "127.0.0.1");

      expect(result.wrappedDek).toBe("wrapped-dek");
      expect(result.files.map((f) => f.path)).toEqual([".env", "deploy/.env"]);
      expect(result.files[0]!.encryptedContent).toBe(Buffer.from("cipher").toString("base64"));
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it("should only return files matching the token's path globs", async () => {
      const files = [
        file(".env"),
        file("deploy/.env"),
        file("deploy/secrets/box-a/.env"),
        file("apps/api/.env"),
      ];
      mockPrisma.repoFile.findMany.mockImplementation(((args: {
        where: { id?: { in: string[] } };
      }) =>
        Promise.resolve(
          files.filter((f) => !args.where.id || args.where.id.in.includes(f.id)),
        )) as never);

      const result = await service.fetchFiles(
        { ...baseCiToken, paths: ["deploy/**"] },
        null,
        "127.0.0.1",
      );

      expect(result.files.map((f) => f.path)).toEqual(["deploy/.env", "deploy/secrets/box-a/.env"]);
    });
  });
});
