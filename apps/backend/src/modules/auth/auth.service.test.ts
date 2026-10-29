import { beforeEach, describe, expect, it } from "bun:test";
import { BadRequestError, ConflictError, UnauthorizedError } from "@/common/errors/http.error";
import { createAuthService, verifiedUser } from "./auth.test-helpers";

describe("AuthService", () => {
  let ctx: ReturnType<typeof createAuthService>;

  beforeEach(() => {
    ctx = createAuthService();
  });

  describe("register", () => {
    const validBody = {
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      password: "Password1",
    };

    it("should register a new user, return tokens, and send a verification email", async () => {
      const result = await ctx.service.register(validBody);

      expect(result.accessToken).toBe("mock-access-token");
      expect(result.user).toMatchObject({ email: "test@example.com", emailVerified: false });
      expect(ctx.emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "test@example.com",
          subject: expect.stringContaining("Verify"),
        }),
      );
    });

    it.each([
      ["has no uppercase letter", "password1"],
      ["has no number", "Password"],
      ["is too short", "Pass1"],
    ])("should throw BadRequestError when the password %s", async (_, password) => {
      expect(ctx.service.register({ ...validBody, password })).rejects.toBeInstanceOf(
        BadRequestError,
      );
    });

    it("should throw ConflictError when email already exists", async () => {
      ctx.prisma.user.findUnique.mockResolvedValueOnce({ email: "test@example.com" });

      expect(ctx.service.register(validBody)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe("login", () => {
    const loginBody = { email: "test@example.com", password: "Password1" };

    it("should return tokens for valid credentials", async () => {
      ctx.prisma.user.findUnique.mockResolvedValueOnce(verifiedUser);

      const result = await ctx.service.login(loginBody);

      expect(result.accessToken).toBe("mock-access-token");
      expect(result.user.email).toBe("test@example.com");
    });

    it("should throw UnauthorizedError for non-existent user", async () => {
      expect(ctx.service.login(loginBody)).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("should throw UnauthorizedError for unverified email", async () => {
      ctx.prisma.user.findUnique.mockResolvedValueOnce({ ...verifiedUser, emailVerified: false });

      expect(ctx.service.login(loginBody)).rejects.toThrow(
        "Please verify your email before logging in",
      );
    });

    it("should throw UnauthorizedError for wrong password", async () => {
      ctx.prisma.user.findUnique.mockResolvedValueOnce(verifiedUser);

      expect(ctx.service.login({ ...loginBody, password: "WrongPass1" })).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });
  });

  describe("forgotPassword", () => {
    it("should return the same message when the user does not exist", async () => {
      const result = await ctx.service.forgotPassword({ email: "nonexistent@example.com" });

      expect(result.message).toContain("If an account with that email exists");
      expect(ctx.emailService.send).not.toHaveBeenCalled();
    });

    it("should set a reset token and email the user when they exist", async () => {
      ctx.prisma.user.findUnique.mockResolvedValueOnce(verifiedUser);

      const result = await ctx.service.forgotPassword({ email: "test@example.com" });

      expect(result.message).toContain("If an account with that email exists");
      expect(ctx.prisma.user.update).toHaveBeenCalled();
      expect(ctx.emailService.send).toHaveBeenCalledWith(
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
        ctx.service.resetPassword({ token: "valid-token", password: "weak" }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("should throw BadRequestError for invalid/expired token", async () => {
      expect(
        ctx.service.resetPassword({ token: "invalid-token", password: "NewPassword1" }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("should reset password and revoke every session", async () => {
      ctx.prisma.user.findFirst.mockResolvedValueOnce(verifiedUser);

      const result = await ctx.service.resetPassword({
        token: "valid-token",
        password: "NewPassword1",
      });

      expect(result.message).toBe("Password has been reset successfully");
      expect(ctx.prisma.authSession.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-uuid" },
      });
    });
  });

  describe("verifyEmail", () => {
    it("should throw BadRequestError for invalid token", async () => {
      expect(ctx.service.verifyEmail({ token: "invalid-token" })).rejects.toBeInstanceOf(
        BadRequestError,
      );
    });

    it("should verify email and clear token", async () => {
      ctx.prisma.user.findFirst.mockResolvedValueOnce({ id: "user-uuid", emailVerified: false });

      const result = await ctx.service.verifyEmail({ token: "valid-token" });

      expect(result.message).toBe("Email verified successfully");
      expect(ctx.prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-uuid" },
        data: { emailVerified: true, emailVerificationToken: null },
      });
    });
  });
});
