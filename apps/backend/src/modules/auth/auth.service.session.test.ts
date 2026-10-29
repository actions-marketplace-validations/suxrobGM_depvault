import { beforeEach, describe, expect, it } from "bun:test";
import { UnauthorizedError } from "@/common/errors/http.error";
import { createAuthService, validRefreshToken, verifiedUser } from "./auth.test-helpers";

const validSession = {
  id: "session-uuid",
  userId: "user-uuid",
  refreshTokenHash: "hashed-refresh-token",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  user: verifiedUser,
};

describe("AuthService", () => {
  let ctx: ReturnType<typeof createAuthService>;

  beforeEach(() => {
    ctx = createAuthService();
  });

  describe("refresh", () => {
    it("should rotate the presented session for a valid refresh token", async () => {
      ctx.prisma.authSession.findUnique.mockResolvedValueOnce(validSession);

      const result = await ctx.service.refresh(validRefreshToken);

      expect(result.accessToken).toBe("mock-access-token");
      expect(ctx.tokenService.rotateTokens).toHaveBeenCalledWith(
        expect.objectContaining({ id: "user-uuid" }),
        "session-uuid",
      );
      expect(ctx.prisma.authSession.deleteMany).not.toHaveBeenCalled();
    });

    it.each([
      ["the token is invalid", "expired-token", null],
      ["the session does not exist", validRefreshToken, null],
      [
        "the session belongs to another user",
        validRefreshToken,
        { ...validSession, userId: "other-user-uuid" },
      ],
    ])("should throw UnauthorizedError when %s", async (_, token, session) => {
      ctx.prisma.authSession.findUnique.mockResolvedValueOnce(session);

      expect(ctx.service.refresh(token)).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it.each([
      ["has expired", { expiresAt: new Date(Date.now() - 1000) }],
      ["was already rotated (replay)", { refreshTokenHash: "rotated-away-hash" }],
    ])("should revoke only that session when it %s", async (_, overrides) => {
      ctx.prisma.authSession.findUnique.mockResolvedValueOnce({ ...validSession, ...overrides });

      await expect(ctx.service.refresh(validRefreshToken)).rejects.toBeInstanceOf(
        UnauthorizedError,
      );

      expect(ctx.prisma.authSession.deleteMany).toHaveBeenCalledTimes(1);
      expect(ctx.prisma.authSession.deleteMany).toHaveBeenCalledWith({
        where: { id: "session-uuid" },
      });
    });
  });

  describe("logout", () => {
    it("should delete the session referenced by a valid refresh token", async () => {
      await ctx.service.logout(validRefreshToken);

      expect(ctx.prisma.authSession.deleteMany).toHaveBeenCalledWith({
        where: { id: "session-uuid", userId: "user-uuid" },
      });
    });

    it.each([
      ["missing", ""],
      ["invalid", "garbage-token"],
    ])("should resolve without revoking for a %s token", async (_, token) => {
      await ctx.service.logout(token);

      expect(ctx.prisma.authSession.deleteMany).not.toHaveBeenCalled();
    });
  });
});
