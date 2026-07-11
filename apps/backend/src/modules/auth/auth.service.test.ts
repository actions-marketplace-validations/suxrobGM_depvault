import "reflect-metadata";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { BadRequestError, ConflictError, UnauthorizedError } from "@/common/errors";
import { EmailService } from "@/common/services/email.service";
import { PrismaClient } from "@/generated/prisma";
import { InvitationService } from "@/modules/invitation/invitation.service";
import type { DeepMockProxy } from "@/types/deep-mock";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";

mock.module("@/common/utils/jwt", () => ({
  signAccessToken: () => Promise.resolve("mock-access-token"),
  signRefreshToken: () => Promise.resolve("mock-refresh-token"),
  verifyRefreshToken: (token: string) => {
    if (token === "valid-refresh-token")
      return Promise.resolve({ sub: "user-uuid", sid: "session-uuid" });
    // Mirrors the real verifier: a token without a `sid` claim never verifies
    return Promise.reject(new Error("Invalid token"));
  },
}));

mock.module("@/common/utils/password", () => ({
  hashPassword: () => Promise.resolve("hashed-password"),
  verifyPassword: (plain: string, hash: string) =>
    Promise.resolve(
      (plain === "valid-refresh-token" && hash === "hashed-refresh-token") ||
        (plain === "Password1" && hash === "hashed-password"),
    ),
}));

mock.module("@/common/logger/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

function createMockPrisma() {
  return {
    user: {
      findFirst: mock(() => Promise.resolve(null)),
      findUnique: mock(() => Promise.resolve(null)),
      create: mock(() =>
        Promise.resolve({
          id: "user-uuid",
          email: "test@example.com",
          firstName: "Test",
          lastName: "User",
          role: "USER",
          emailVerified: false,
          passwordHash: "hashed-password",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      update: mock(() => Promise.resolve({})),
    },
    authSession: {
      findUnique: mock(() => Promise.resolve(null)),
      create: mock(() => Promise.resolve({})),
      update: mock(() => Promise.resolve({})),
      deleteMany: mock(() => Promise.resolve({ count: 1 })),
    },
  } as unknown as DeepMockProxy<PrismaClient>;
}

const mockAuthResponse = {
  accessToken: "mock-access-token",
  refreshToken: "mock-refresh-token",
  user: {
    id: "user-uuid",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    role: "USER",
    emailVerified: false,
    avatarUrl: null,
  },
};

function createMockTokenService() {
  return {
    issueTokens: mock(() => Promise.resolve(mockAuthResponse)),
    rotateTokens: mock(() => Promise.resolve(mockAuthResponse)),
  } as unknown as TokenService;
}

function createMockEmailService() {
  return { send: mock(() => Promise.resolve()) } as unknown as EmailService;
}

function createMockInvitationService() {
  return { linkPendingInvitations: mock(() => Promise.resolve()) } as unknown as InvitationService;
}

describe("AuthService", () => {
  let service: AuthService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockTokenService: ReturnType<typeof createMockTokenService>;
  let mockEmailService: ReturnType<typeof createMockEmailService>;
  let mockInvitationService: ReturnType<typeof createMockInvitationService>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockTokenService = createMockTokenService();
    mockEmailService = createMockEmailService();
    mockInvitationService = createMockInvitationService();
    service = new AuthService(
      mockPrisma,
      mockTokenService,
      mockEmailService,
      mockInvitationService,
    );
  });

  describe("register", () => {
    const validBody = {
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      password: "Password1",
    };

    it("should register a new user and return both tokens", async () => {
      const result = await service.register(validBody);

      expect(result.accessToken).toBe("mock-access-token");
      expect(result.refreshToken).toBe("mock-refresh-token");
      expect(result.user.email).toBe("test@example.com");
      expect(result.user.firstName).toBe("Test");
      expect(result.user.lastName).toBe("User");
      expect(result.user.role).toBe("USER");
      expect(result.user.emailVerified).toBe(false);
    });

    it("should send a verification email on registration", async () => {
      await service.register(validBody);

      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "test@example.com",
          subject: expect.stringContaining("Verify"),
        }),
      );
    });

    it("should throw BadRequestError when password has no uppercase letter", async () => {
      expect(service.register({ ...validBody, password: "password1" })).rejects.toBeInstanceOf(
        BadRequestError,
      );
    });

    it("should throw BadRequestError when password has no number", async () => {
      expect(service.register({ ...validBody, password: "Password" })).rejects.toBeInstanceOf(
        BadRequestError,
      );
    });

    it("should throw BadRequestError when password is too short", async () => {
      expect(service.register({ ...validBody, password: "Pass1" })).rejects.toBeInstanceOf(
        BadRequestError,
      );
    });

    it("should throw ConflictError when email already exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        email: "test@example.com",
      });

      expect(service.register(validBody)).rejects.toThrow("User with this email already exists");
    });

    it("should throw ConflictError instance for duplicate email", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        email: "test@example.com",
      });

      expect(service.register(validBody)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe("login", () => {
    const loginBody = { email: "test@example.com", password: "Password1" };

    const verifiedUser = {
      id: "user-uuid",
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      role: "USER",
      emailVerified: true,
      passwordHash: "hashed-password",
      deletedAt: null,
    };

    it("should return tokens for valid credentials", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(verifiedUser);

      const result = await service.login(loginBody);

      expect(result.accessToken).toBe("mock-access-token");
      expect(result.refreshToken).toBe("mock-refresh-token");
      expect(result.user.email).toBe("test@example.com");
    });

    it("should throw UnauthorizedError for non-existent user", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      expect(service.login(loginBody)).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("should throw UnauthorizedError for unverified email", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...verifiedUser,
        emailVerified: false,
      });

      expect(service.login(loginBody)).rejects.toThrow(
        "Please verify your email before logging in",
      );
    });

    it("should throw UnauthorizedError for wrong password", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(verifiedUser);

      expect(service.login({ ...loginBody, password: "WrongPass1" })).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it("should throw UnauthorizedError for soft-deleted user", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...verifiedUser,
        deletedAt: new Date(),
      });

      expect(service.login(loginBody)).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe("refresh", () => {
    const validUser = {
      id: "user-uuid",
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      role: "USER",
      emailVerified: true,
      deletedAt: null,
    };

    const validSession = {
      id: "session-uuid",
      userId: "user-uuid",
      refreshTokenHash: "hashed-refresh-token",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      user: validUser,
    };

    it("should rotate the presented session for a valid refresh token", async () => {
      mockPrisma.authSession.findUnique.mockResolvedValueOnce(validSession);

      const result = await service.refresh("valid-refresh-token");

      expect(result.accessToken).toBe("mock-access-token");
      expect(result.refreshToken).toBe("mock-refresh-token");
      expect(result.user.id).toBe("user-uuid");
      expect(mockTokenService.rotateTokens).toHaveBeenCalledWith(
        expect.objectContaining({ id: "user-uuid" }),
        "session-uuid",
      );
      expect(mockPrisma.authSession.deleteMany).not.toHaveBeenCalled();
    });

    it("should throw UnauthorizedError for an expired/invalid refresh token", async () => {
      expect(service.refresh("expired-token")).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("should throw UnauthorizedError when user is soft-deleted", async () => {
      mockPrisma.authSession.findUnique.mockResolvedValueOnce({
        ...validSession,
        user: { ...validUser, deletedAt: new Date() },
      });

      expect(service.refresh("valid-refresh-token")).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("should throw UnauthorizedError when the session does not exist", async () => {
      mockPrisma.authSession.findUnique.mockResolvedValueOnce(null);

      expect(service.refresh("valid-refresh-token")).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("should throw UnauthorizedError when the session belongs to another user", async () => {
      mockPrisma.authSession.findUnique.mockResolvedValueOnce({
        ...validSession,
        userId: "other-user-uuid",
      });

      expect(service.refresh("valid-refresh-token")).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("should delete an expired session and throw UnauthorizedError", async () => {
      mockPrisma.authSession.findUnique.mockResolvedValueOnce({
        ...validSession,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh("valid-refresh-token")).rejects.toBeInstanceOf(
        UnauthorizedError,
      );

      expect(mockPrisma.authSession.deleteMany).toHaveBeenCalledWith({
        where: { id: "session-uuid" },
      });
    });

    it("should revoke only the replayed session on hash mismatch, leaving other devices intact", async () => {
      mockPrisma.authSession.findUnique.mockResolvedValueOnce({
        ...validSession,
        refreshTokenHash: "rotated-away-hash",
      });

      await expect(service.refresh("valid-refresh-token")).rejects.toBeInstanceOf(
        UnauthorizedError,
      );

      expect(mockPrisma.authSession.deleteMany).toHaveBeenCalledWith({
        where: { id: "session-uuid" },
      });
      expect(mockPrisma.authSession.deleteMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("logout", () => {
    it("should delete the session referenced by a valid refresh token", async () => {
      await service.logout("valid-refresh-token");

      expect(mockPrisma.authSession.deleteMany).toHaveBeenCalledWith({
        where: { id: "session-uuid", userId: "user-uuid" },
      });
    });

    it("should resolve without revoking for a missing token", async () => {
      await service.logout("");

      expect(mockPrisma.authSession.deleteMany).not.toHaveBeenCalled();
    });

    it("should resolve without throwing for an invalid token", async () => {
      await service.logout("garbage-token");

      expect(mockPrisma.authSession.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("forgotPassword", () => {
    it("should return success message even if user does not exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const result = await service.forgotPassword({ email: "nonexistent@example.com" });

      expect(result.message).toContain("If an account with that email exists");
    });

    it("should set reset token on existing user", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: "user-uuid",
        email: "test@example.com",
        firstName: "Test",
        deletedAt: null,
      });

      const result = await service.forgotPassword({ email: "test@example.com" });

      expect(result.message).toContain("If an account with that email exists");
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });

    it("should send a password reset email when user exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: "user-uuid",
        email: "test@example.com",
        firstName: "Test",
        deletedAt: null,
      });

      await service.forgotPassword({ email: "test@example.com" });

      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "test@example.com",
          subject: expect.stringContaining("Reset"),
        }),
      );
    });
  });

  describe("resetPassword", () => {
    it("should throw BadRequestError for weak password", async () => {
      expect(
        service.resetPassword({ token: "valid-token", password: "weak" }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("should throw BadRequestError for invalid/expired token", async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      expect(
        service.resetPassword({ token: "invalid-token", password: "NewPassword1" }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("should reset password and revoke refresh tokens", async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: "user-uuid",
        email: "test@example.com",
      });

      const result = await service.resetPassword({
        token: "valid-token",
        password: "NewPassword1",
      });

      expect(result.message).toBe("Password has been reset successfully");
      expect(mockPrisma.user.update).toHaveBeenCalled();
      expect(mockPrisma.authSession.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-uuid" },
      });
    });
  });

  describe("verifyEmail", () => {
    it("should throw BadRequestError for invalid token", async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      expect(service.verifyEmail({ token: "invalid-token" })).rejects.toBeInstanceOf(
        BadRequestError,
      );
    });

    it("should verify email and clear token", async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: "user-uuid",
        emailVerified: false,
        emailVerificationToken: "valid-token",
      });

      const result = await service.verifyEmail({ token: "valid-token" });

      expect(result.message).toBe("Email verified successfully");
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-uuid" },
        data: { emailVerified: true, emailVerificationToken: null },
      });
    });
  });
});
