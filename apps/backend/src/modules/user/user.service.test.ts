import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "@/common/errors/http.error";
import type { EmailService } from "@/common/services/email.service";
import { signRefreshToken } from "@/common/utils/jwt";
import { env } from "@/env";
import type { PrismaClient } from "@/generated/prisma";
import type { DeepMockProxy } from "@/types/deep-mock";
import { UserService } from "./user.service";

mock.module("@/common/utils/password", () => ({
  hashPassword: () => Promise.resolve("new-hashed-password"),
  verifyPassword: (plain: string, hash: string) =>
    Promise.resolve(plain === "CurrentPass1" && hash === "hashed-password"),
}));

mock.module("@/common/logger/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

env.JWT_SECRET = "test-jwt-secret-for-unit-tests";

const baseUser = {
  id: "user-uuid",
  email: "test@example.com",
  firstName: "Test",
  lastName: "User",
  role: "USER",
  avatarUrl: null,
  emailVerified: true,
  githubId: null,
  githubUsername: null,
  passwordHash: "hashed-password",
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

function createMockPrisma() {
  return {
    user: {
      findUnique: mock(() => Promise.resolve(baseUser)),
      findFirst: mock(() => Promise.resolve(null)),
      update: mock(() => Promise.resolve({ ...baseUser })),
      delete: mock(() => Promise.resolve({ ...baseUser })),
    },
    authSession: {
      deleteMany: mock(() => Promise.resolve({ count: 0 })),
    },
    project: {
      deleteMany: mock(() => Promise.resolve({ count: 0 })),
    },
    $transaction: mock((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as DeepMockProxy<PrismaClient>;
}

describe("UserService", () => {
  let service: UserService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockEmailService: DeepMockProxy<EmailService>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockEmailService = {
      send: mock(() => Promise.resolve()),
    } as unknown as DeepMockProxy<EmailService>;
    service = new UserService(mockPrisma, mockEmailService as unknown as EmailService);
  });

  describe("getProfile", () => {
    it("should return the user profile", async () => {
      const result = await service.getProfile("user-uuid");

      expect(result).toMatchObject({
        id: "user-uuid",
        email: "test@example.com",
        hasPassword: true,
        createdAt: "2025-01-01T00:00:00.000Z",
      });
    });

    it("should throw NotFoundError when user does not exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      expect(service.getProfile("nonexistent")).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("updateProfile", () => {
    it("should only update the provided fields", async () => {
      mockPrisma.user.update.mockResolvedValueOnce({ ...baseUser, firstName: "Jane" });

      const result = await service.updateProfile("user-uuid", { firstName: "Jane" });

      expect(result.firstName).toBe("Jane");
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-uuid" },
        data: { firstName: "Jane" },
      });
    });
  });

  describe("changePassword", () => {
    const validBody = { currentPassword: "CurrentPass1", newPassword: "NewPassword1" };

    it("should change the password and sign out every other session", async () => {
      const refreshToken = await signRefreshToken("user-uuid", "current-session");

      const result = await service.changePassword("user-uuid", validBody, refreshToken);

      expect(result.message).toBe("Password changed successfully");
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-uuid" },
        data: { passwordHash: "new-hashed-password" },
      });
      expect(mockPrisma.authSession.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-uuid", id: { not: "current-session" } },
      });
    });

    it("should sign out every session when the caller has no valid refresh token", async () => {
      await service.changePassword("user-uuid", validBody, "");

      expect(mockPrisma.authSession.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-uuid" },
      });
    });

    it("should set a password for OAuth-only accounts without currentPassword", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ ...baseUser, passwordHash: null });

      const result = await service.changePassword("user-uuid", { newPassword: "NewPassword1" }, "");

      expect(result.message).toBe("Password changed successfully");
    });

    it.each([
      ["the new password is weak", { currentPassword: "CurrentPass1", newPassword: "weak" }],
      ["currentPassword is missing", { newPassword: "NewPassword1" }],
    ])("should throw BadRequestError when %s", async (_, body) => {
      expect(service.changePassword("user-uuid", body, "")).rejects.toBeInstanceOf(BadRequestError);
    });

    it("should throw UnauthorizedError for wrong current password", async () => {
      expect(
        service.changePassword(
          "user-uuid",
          { currentPassword: "WrongPass1", newPassword: "NewPassword1" },
          "",
        ),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe("changeEmail", () => {
    const validBody = { newEmail: "new@example.com", password: "CurrentPass1" };

    it("should change email, require re-verification, and email the new address", async () => {
      const result = await service.changeEmail("user-uuid", validBody);

      expect(result.message).toContain("Please verify your new email");
      expect(mockPrisma.user.update.mock.calls[0]![0].data).toMatchObject({
        email: "new@example.com",
        emailVerified: false,
      });
      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: "new@example.com" }),
      );
    });

    it("should throw BadRequestError for OAuth-only accounts", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ ...baseUser, passwordHash: null });

      expect(service.changeEmail("user-uuid", validBody)).rejects.toBeInstanceOf(BadRequestError);
    });

    it("should throw UnauthorizedError for wrong password", async () => {
      expect(
        service.changeEmail("user-uuid", { ...validBody, password: "WrongPass1" }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("should throw ConflictError when email is already in use", async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: "other-uuid" });

      expect(service.changeEmail("user-uuid", validBody)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe("deleteAccount", () => {
    it("should delete owned projects and the user in one transaction", async () => {
      const result = await service.deleteAccount("user-uuid");

      expect(result.message).toBe("Account permanently deleted");
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.project.deleteMany).toHaveBeenCalledWith({
        where: { members: { some: { userId: "user-uuid", role: "OWNER" } } },
      });
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: "user-uuid" } });
    });

    it("should throw NotFoundError when user does not exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      expect(service.deleteAccount("nonexistent")).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
