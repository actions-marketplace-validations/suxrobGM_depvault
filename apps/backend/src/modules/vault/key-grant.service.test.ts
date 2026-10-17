import "reflect-metadata";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/common/errors/http.error";
import { KeyGrantType, type PrismaClient } from "@/generated/prisma";
import type { DeepMockProxy } from "@/types/deep-mock";
import { type KeyGrantCaller, KeyGrantService } from "./key-grant.service";

const baseGrant = {
  id: "grant-uuid",
  projectId: "project-uuid",
  userId: "user-uuid",
  wrappedDek: "wrapped-dek",
  wrappedDekIv: "wrapped-iv",
  wrappedDekTag: "wrapped-tag",
  granterPublicKey: null,
  grantType: KeyGrantType.SELF,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseMember = {
  id: "member-uuid",
  projectId: "project-uuid",
  userId: "other-uuid",
  role: "VIEWER",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createMockPrisma() {
  return {
    projectKeyGrant: {
      findUnique: mock(() => Promise.resolve(null)),
      findFirst: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      create: mock(() => Promise.resolve({ ...baseGrant })),
      update: mock(() => Promise.resolve({ ...baseGrant })),
    },
    projectMember: {
      findUnique: mock(() => Promise.resolve({ ...baseMember })),
      findMany: mock(() => Promise.resolve([])),
    },
  } as unknown as DeepMockProxy<PrismaClient>;
}

const viewer: KeyGrantCaller = { userId: "user-uuid", role: "VIEWER" };
const editor: KeyGrantCaller = { userId: "user-uuid", role: "EDITOR" };

const selfBody = {
  userId: "user-uuid",
  wrappedDek: "wrapped-dek",
  wrappedDekIv: "wrapped-iv",
  wrappedDekTag: "wrapped-tag",
  grantType: KeyGrantType.SELF,
};

const ecdhBody = {
  userId: "other-uuid",
  wrappedDek: "wrapped-dek",
  wrappedDekIv: "wrapped-iv",
  wrappedDekTag: "wrapped-tag",
  granterPublicKey: "granter-pub",
  grantType: KeyGrantType.ECDH,
};

let mockPrisma: ReturnType<typeof createMockPrisma>;
let service: KeyGrantService;

beforeEach(() => {
  mockPrisma = createMockPrisma();
  service = new KeyGrantService(mockPrisma);
});

describe("KeyGrantService", () => {
  describe("create", () => {
    it("allows a viewer to create their own SELF grant", async () => {
      const result = await service.create("project-uuid", viewer, selfBody);

      expect(result.grantType).toBe(KeyGrantType.SELF);
      expect(mockPrisma.projectKeyGrant.create).toHaveBeenCalled();
    });

    it("allows a viewer to create their own RECOVERY grant", async () => {
      await service.create("project-uuid", viewer, {
        ...selfBody,
        grantType: KeyGrantType.RECOVERY,
      });

      expect(mockPrisma.projectKeyGrant.create).toHaveBeenCalled();
    });

    it("rejects a self ECDH grant", async () => {
      expect(
        service.create("project-uuid", viewer, { ...selfBody, grantType: KeyGrantType.ECDH }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("rejects a viewer granting to another member", async () => {
      expect(service.create("project-uuid", viewer, ecdhBody)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });

    it("rejects a SELF grant targeting another user regardless of role", async () => {
      expect(
        service.create("project-uuid", editor, {
          ...selfBody,
          userId: "other-uuid",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("allows an editor to create an ECDH grant for a project member", async () => {
      await service.create("project-uuid", editor, ecdhBody);

      expect(mockPrisma.projectMember.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId_userId: { projectId: "project-uuid", userId: "other-uuid" } },
        }),
      );
      expect(mockPrisma.projectKeyGrant.create).toHaveBeenCalled();
    });

    it("rejects an ECDH grant without granterPublicKey", async () => {
      expect(
        service.create("project-uuid", editor, { ...ecdhBody, granterPublicKey: undefined }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("rejects an ECDH grant for a non-member target", async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValueOnce(null);

      expect(service.create("project-uuid", editor, ecdhBody)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it("rejects a new SELF grant when other members already hold the project key", async () => {
      mockPrisma.projectKeyGrant.findMany.mockResolvedValueOnce([{ userId: "other-uuid" }]);

      expect(service.create("project-uuid", viewer, selfBody)).rejects.toBeInstanceOf(
        ConflictError,
      );
    });

    it("allows a new RECOVERY grant when the caller already holds the project key", async () => {
      mockPrisma.projectKeyGrant.findMany.mockResolvedValueOnce([
        { userId: "other-uuid" },
        { userId: "user-uuid" },
      ]);

      await service.create("project-uuid", viewer, {
        ...selfBody,
        grantType: KeyGrantType.RECOVERY,
      });

      expect(mockPrisma.projectKeyGrant.create).toHaveBeenCalled();
    });

    it("overwrites an existing grant for the same (project, user, type)", async () => {
      mockPrisma.projectKeyGrant.findUnique.mockResolvedValueOnce({ ...baseGrant });

      await service.create("project-uuid", viewer, selfBody);

      expect(mockPrisma.projectKeyGrant.update).toHaveBeenCalled();
      expect(mockPrisma.projectKeyGrant.create).not.toHaveBeenCalled();
    });
  });

  describe("getForUser", () => {
    it("throws NotFoundError when no grant exists", async () => {
      expect(service.getForUser("project-uuid", "user-uuid")).rejects.toBeInstanceOf(NotFoundError);
    });

    it("returns the most recent non-recovery grant", async () => {
      mockPrisma.projectKeyGrant.findFirst.mockResolvedValueOnce({ ...baseGrant });

      const result = await service.getForUser("project-uuid", "user-uuid");
      expect(result.id).toBe("grant-uuid");
    });
  });
});
