import "reflect-metadata";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { verifyRefreshToken } from "@/common/utils/jwt";
import { PrismaClient } from "@/generated/prisma";
import type { DeepMockProxy } from "@/types/deep-mock";
import { TokenService } from "./token.service";

// The real signer is used here: it is pure and fast, and mocking it would
// replace the module globally for every other test file in the run.
process.env.JWT_SECRET = "test-jwt-secret-for-unit-tests";

// bcrypt at cost 12 is far too slow for a unit test.
mock.module("@/common/utils/password", () => ({
  hashPassword: (value: string) => Promise.resolve(`hashed-${value}`),
}));

function createMockPrisma() {
  return {
    authSession: {
      create: mock(() => Promise.resolve({})),
      update: mock(() => Promise.resolve({})),
    },
  } as unknown as DeepMockProxy<PrismaClient>;
}

const user = {
  id: "user-uuid",
  email: "test@example.com",
  firstName: "Test",
  lastName: "User",
  role: "USER",
  emailVerified: true,
  avatarUrl: null,
};

describe("TokenService", () => {
  let service: TokenService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new TokenService(mockPrisma);
  });

  describe("issueTokens", () => {
    it("should create a session whose id matches the refresh token sid claim", async () => {
      const result = await service.issueTokens(user);

      const { sub, sid } = await verifyRefreshToken(result.refreshToken);
      expect(sub).toBe("user-uuid");
      expect(result.user.id).toBe("user-uuid");
      expect(result.accessToken.split(".")).toHaveLength(3);

      expect(mockPrisma.authSession.create).toHaveBeenCalledWith({
        data: {
          id: sid,
          userId: "user-uuid",
          refreshTokenHash: `hashed-${result.refreshToken}`,
          expiresAt: expect.any(Date),
        },
      });
    });

    it("should create a distinct session per login", async () => {
      const first = await service.issueTokens(user);
      const second = await service.issueTokens(user);

      const { sid: firstSid } = await verifyRefreshToken(first.refreshToken);
      const { sid: secondSid } = await verifyRefreshToken(second.refreshToken);

      expect(firstSid).not.toBe(secondSid);
      expect(mockPrisma.authSession.create).toHaveBeenCalledTimes(2);
    });
  });

  describe("rotateTokens", () => {
    it("should rotate the hash in place, preserving the session id", async () => {
      const result = await service.rotateTokens(user, "session-uuid");

      expect(await verifyRefreshToken(result.refreshToken)).toEqual({
        sub: "user-uuid",
        sid: "session-uuid",
      });
      expect(mockPrisma.authSession.update).toHaveBeenCalledWith({
        where: { id: "session-uuid" },
        data: {
          refreshTokenHash: `hashed-${result.refreshToken}`,
          expiresAt: expect.any(Date),
        },
      });
      expect(mockPrisma.authSession.create).not.toHaveBeenCalled();
    });
  });
});
