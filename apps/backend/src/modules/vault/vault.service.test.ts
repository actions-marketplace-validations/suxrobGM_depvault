import "reflect-metadata";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { ConflictError, ForbiddenError, NotFoundError } from "@/common/errors/http.error";
import { KeyGrantType, type PrismaClient } from "@/generated/prisma";
import type { DeepMockProxy } from "@/types/deep-mock";
import { VaultService } from "./vault.service";

process.env.FRONTEND_URL ??= "http://localhost:4001";

const wrapped = { wrappedDek: "dek", wrappedDekIv: "iv", wrappedDekTag: "tag" };
const newKeys = {
  kekSalt: "salt",
  kekIterations: 600000,
  wrappedPrivateKey: "pk",
  wrappedPrivateKeyIv: "pk-iv",
  wrappedPrivateKeyTag: "pk-tag",
  wrappedRecoveryKey: "rk",
  wrappedRecoveryKeyIv: "rk-iv",
  wrappedRecoveryKeyTag: "rk-tag",
};

function createMockPrisma() {
  const tx = {
    userVault: { update: mock(() => Promise.resolve({})) },
    projectKeyGrant: {
      findMany: mock(() => Promise.resolve([{ projectId: "p1" }] as Array<{ projectId: string }>)),
      deleteMany: mock(() => Promise.resolve({ count: 0 })),
      createMany: mock(() => Promise.resolve({ count: 0 })),
    },
  };
  return {
    tx,
    prisma: {
      $transaction: mock((fn: (client: unknown) => Promise<unknown>) => fn(tx)),
      userVault: {
        findUnique: mock(() => Promise.resolve({ recoveryKeyHash: "hash" } as unknown)),
        create: mock(() => Promise.resolve({})),
      },
    },
  };
}

let mocks: ReturnType<typeof createMockPrisma>;
let service: VaultService;

beforeEach(() => {
  mocks = createMockPrisma();
  service = new VaultService(mocks.prisma as unknown as DeepMockProxy<PrismaClient>);
});

describe("VaultService", () => {
  describe("getStatus", () => {
    it("should return only hasVault and the setup URL when there is no vault", async () => {
      mocks.prisma.userVault.findUnique.mockResolvedValueOnce(null);

      const status = await service.getStatus("u1");

      expect(status).toEqual({ hasVault: false, setupUrl: expect.any(String) });
    });
  });

  describe("changePassword", () => {
    it("should replace SELF grants when they cover every SELF grant held", async () => {
      await service.changePassword("u1", {
        ...newKeys,
        selfGrants: [{ projectId: "p1", ...wrapped }],
      });

      expect(mocks.tx.projectKeyGrant.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u1", grantType: KeyGrantType.SELF },
      });
      expect(mocks.tx.projectKeyGrant.createMany).toHaveBeenCalled();
    });

    it("should reject a batch missing a project the user holds", async () => {
      mocks.tx.projectKeyGrant.findMany.mockResolvedValueOnce([
        { projectId: "p1" },
        { projectId: "p2" },
      ]);

      expect(
        service.changePassword("u1", { ...newKeys, selfGrants: [{ projectId: "p1", ...wrapped }] }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("should reject duplicate projects in the batch", async () => {
      expect(
        service.changePassword("u1", {
          ...newKeys,
          selfGrants: [
            { projectId: "p1", ...wrapped },
            { projectId: "p1", ...wrapped },
          ],
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("should throw NotFoundError without a vault", async () => {
      mocks.prisma.userVault.findUnique.mockResolvedValueOnce(null);

      expect(service.changePassword("u1", { ...newKeys, selfGrants: [] })).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe("recover", () => {
    const body = {
      ...newKeys,
      recoveryKeyHash: "hash",
      publicKey: "pub",
      selfGrants: [{ projectId: "p1", ...wrapped }],
    };

    it("should reject a recovery key whose hash doesn't match", async () => {
      expect(service.recover("u1", { ...body, recoveryKeyHash: "nope" })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    });

    it("should drop shared grants and rebuild SELF grants from RECOVERY grants", async () => {
      await service.recover("u1", body);

      expect(mocks.tx.projectKeyGrant.findMany).toHaveBeenCalledWith({
        where: { userId: "u1", grantType: KeyGrantType.RECOVERY },
        select: { projectId: true },
      });
      expect(mocks.tx.projectKeyGrant.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u1", grantType: KeyGrantType.ECDH },
      });
      expect(mocks.tx.projectKeyGrant.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u1", grantType: KeyGrantType.SELF },
      });
    });

    it("should allow recovery with no projects", async () => {
      mocks.tx.projectKeyGrant.findMany.mockResolvedValueOnce([]);

      await service.recover("u1", { ...body, selfGrants: [] });

      expect(mocks.tx.userVault.update).toHaveBeenCalled();
    });
  });

  describe("regenerateRecoveryKey", () => {
    it("should rebuild RECOVERY grants to cover every SELF grant", async () => {
      await service.regenerateRecoveryKey("u1", {
        newRecoveryKeyHash: "new-hash",
        wrappedRecoveryKey: "rk",
        wrappedRecoveryKeyIv: "rk-iv",
        wrappedRecoveryKeyTag: "rk-tag",
        recoveryGrants: [{ projectId: "p1", ...wrapped }],
      });

      expect(mocks.tx.projectKeyGrant.findMany).toHaveBeenCalledWith({
        where: { userId: "u1", grantType: KeyGrantType.SELF },
        select: { projectId: true },
      });
      expect(mocks.tx.projectKeyGrant.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u1", grantType: KeyGrantType.RECOVERY },
      });
    });
  });
});
