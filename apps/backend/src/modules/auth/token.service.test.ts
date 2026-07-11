import "reflect-metadata";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { PrismaClient } from "@/generated/prisma";
import type { DeepMockProxy } from "@/types/deep-mock";
import { TokenService } from "./token.service";

const signRefreshToken = mock((_userId: string, _sessionId: string) =>
  Promise.resolve("mock-refresh-token"),
);

mock.module("@/common/utils/jwt", () => ({
  signAccessToken: () => Promise.resolve("mock-access-token"),
  signRefreshToken,
}));

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
    signRefreshToken.mockClear();
    mockPrisma = createMockPrisma();
    service = new TokenService(mockPrisma);
  });

  describe("issueTokens", () => {
    it("should create a session whose id matches the refresh token sid claim", async () => {
      const result = await service.issueTokens(user);

      expect(result.accessToken).toBe("mock-access-token");
      expect(result.refreshToken).toBe("mock-refresh-token");
      expect(result.user.id).toBe("user-uuid");

      const signedSessionId = signRefreshToken.mock.calls[0]?.[1];
      expect(signedSessionId).toBeString();
      expect(mockPrisma.authSession.create).toHaveBeenCalledWith({
        data: {
          id: signedSessionId,
          userId: "user-uuid",
          refreshTokenHash: "hashed-mock-refresh-token",
          expiresAt: expect.any(Date),
        },
      });
    });

    it("should create a distinct session per login", async () => {
      await service.issueTokens(user);
      await service.issueTokens(user);

      const [first, second] = signRefreshToken.mock.calls.map((call) => call[1]);
      expect(first).not.toBe(second);
      expect(mockPrisma.authSession.create).toHaveBeenCalledTimes(2);
    });
  });

  describe("rotateTokens", () => {
    it("should rotate the hash in place, preserving the session id", async () => {
      const result = await service.rotateTokens(user, "session-uuid");

      expect(result.accessToken).toBe("mock-access-token");
      expect(result.refreshToken).toBe("mock-refresh-token");
      expect(signRefreshToken).toHaveBeenCalledWith("user-uuid", "session-uuid");
      expect(mockPrisma.authSession.update).toHaveBeenCalledWith({
        where: { id: "session-uuid" },
        data: {
          refreshTokenHash: "hashed-mock-refresh-token",
          expiresAt: expect.any(Date),
        },
      });
      expect(mockPrisma.authSession.create).not.toHaveBeenCalled();
    });
  });
});
