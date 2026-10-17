import "reflect-metadata";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { BadRequestError, ConflictError, NotFoundError } from "@/common/errors/http.error";
import { KeyGrantType, type PrismaClient } from "@/generated/prisma";
import type { DeepMockProxy } from "@/types/deep-mock";
import { KeyGrantService } from "./key-grant.service";

const wrapped = { wrappedDek: "dek", wrappedDekIv: "iv", wrappedDekTag: "tag" };

function createMockPrisma() {
  const tx = {
    $queryRaw: mock(() => Promise.resolve([])),
    projectKeyGrant: {
      findMany: mock(() => Promise.resolve([] as Array<{ userId: string }>)),
      upsert: mock(() => Promise.resolve({})),
      deleteMany: mock(() => Promise.resolve({ count: 0 })),
    },
  };
  return {
    tx,
    prisma: {
      $transaction: mock((fn: (client: unknown) => Promise<unknown>) => fn(tx)),
      projectKeyGrant: {
        findFirst: mock(() => Promise.resolve(null as unknown)),
        findMany: mock(() => Promise.resolve([])),
        upsert: mock(() => Promise.resolve({})),
      },
      projectMember: {
        findUnique: mock(() => Promise.resolve({ user: { vault: { id: "v" } } } as unknown)),
        findMany: mock(() => Promise.resolve([])),
      },
      userVault: {
        findUnique: mock(() => Promise.resolve({ publicKey: "granter-pub" } as unknown)),
      },
    },
  };
}

let mocks: ReturnType<typeof createMockPrisma>;
let service: KeyGrantService;

beforeEach(() => {
  mocks = createMockPrisma();
  service = new KeyGrantService(mocks.prisma as unknown as DeepMockProxy<PrismaClient>);
});

describe("KeyGrantService", () => {
  describe("getForUser", () => {
    it("should prefer a SELF grant over a shared one", async () => {
      mocks.prisma.projectKeyGrant.findFirst.mockResolvedValueOnce({
        ...wrapped,
        granterPublicKey: null,
        grantType: KeyGrantType.SELF,
      });

      await service.getForUser("p1", "u1");

      const args = mocks.prisma.projectKeyGrant.findFirst.mock.calls[0] as unknown as [
        { orderBy: unknown; where: { grantType: unknown } },
      ];
      expect(args[0].orderBy).toEqual({ grantType: "asc" });
      expect(args[0].where.grantType).toEqual({ in: [KeyGrantType.SELF, KeyGrantType.ECDH] });
    });

    it("should throw NotFoundError when the user holds no grant", async () => {
      expect(service.getForUser("p1", "u1")).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("storeOwn", () => {
    const body = { self: wrapped, recovery: wrapped };

    it("should store SELF and RECOVERY and drop the shared grant in one transaction", async () => {
      await service.storeOwn("p1", "u1", body);

      expect(mocks.tx.$queryRaw).toHaveBeenCalled();
      const types = mocks.tx.projectKeyGrant.upsert.mock.calls.map(
        (c) => (c as unknown as [{ create: { grantType: KeyGrantType } }])[0].create.grantType,
      );
      expect(types).toEqual([KeyGrantType.SELF, KeyGrantType.RECOVERY]);
      expect(mocks.tx.projectKeyGrant.deleteMany).toHaveBeenCalledWith({
        where: { projectId: "p1", userId: "u1", grantType: KeyGrantType.ECDH },
      });
    });

    it("should let a member who already holds a grant adopt it", async () => {
      mocks.tx.projectKeyGrant.findMany.mockResolvedValueOnce([{ userId: "u2" }, { userId: "u1" }]);

      await service.storeOwn("p1", "u1", body);

      expect(mocks.tx.projectKeyGrant.upsert).toHaveBeenCalledTimes(2);
    });

    it("should refuse a new key when only others hold one", async () => {
      mocks.tx.projectKeyGrant.findMany.mockResolvedValueOnce([{ userId: "u2" }]);

      expect(service.storeOwn("p1", "u1", body)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe("shareWithMember", () => {
    it("should store an ECDH grant with the granter's public key from their vault", async () => {
      await service.shareWithMember("p1", "granter", { userId: "u2", ...wrapped });

      const [args] = mocks.prisma.projectKeyGrant.upsert.mock.calls[0] as unknown as [
        { create: { grantType: KeyGrantType; granterPublicKey: string } },
      ];
      expect(args.create.grantType).toBe(KeyGrantType.ECDH);
      expect(args.create.granterPublicKey).toBe("granter-pub");
    });

    it("should reject sharing with yourself", async () => {
      expect(
        service.shareWithMember("p1", "u1", { userId: "u1", ...wrapped }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("should reject a non-member", async () => {
      mocks.prisma.projectMember.findUnique.mockResolvedValueOnce(null);

      expect(
        service.shareWithMember("p1", "granter", { userId: "u2", ...wrapped }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("should reject a member without a vault", async () => {
      mocks.prisma.projectMember.findUnique.mockResolvedValueOnce({ user: { vault: null } });

      expect(
        service.shareWithMember("p1", "granter", { userId: "u2", ...wrapped }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });
  });

  describe("getPendingMembers", () => {
    it("should map members without an access grant", async () => {
      mocks.prisma.projectMember.findMany.mockResolvedValueOnce([
        {
          user: {
            id: "u2",
            email: "a@b.c",
            firstName: "A",
            lastName: "B",
            vault: { publicKey: "pub" },
          },
        },
      ] as never);

      const result = await service.getPendingMembers("p1");

      expect(result).toEqual([
        {
          userId: "u2",
          email: "a@b.c",
          firstName: "A",
          lastName: "B",
          hasVault: true,
          publicKey: "pub",
        },
      ]);
    });
  });
});
