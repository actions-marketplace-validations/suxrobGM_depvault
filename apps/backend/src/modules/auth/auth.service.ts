import { randomUUID } from "crypto";
import { isValidPassword, PASSWORD_REQUIREMENTS } from "@depvault/shared/utils";
import { singleton } from "tsyringe";
import { PasswordResetTemplate, VerifyEmailTemplate } from "@/common/emails";
import { BadRequestError, ConflictError, UnauthorizedError } from "@/common/errors";
import { logger } from "@/common/logger/logger";
import { EmailService } from "@/common/services/email.service";
import { verifyRefreshToken } from "@/common/utils/jwt";
import { hashPassword, verifyPassword } from "@/common/utils/password";
import { PrismaClient } from "@/generated/prisma";
import { InvitationService } from "@/modules/invitation/invitation.service";
import type {
  AuthResponse,
  ForgotPasswordBody,
  LoginBody,
  RegisterBody,
  ResetPasswordBody,
  VerifyEmailBody,
} from "./auth.schema";
import { TokenService } from "./token.service";

const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

@singleton()
export class AuthService {
  private readonly frontendUrl = process.env.FRONTEND_URL!;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokenService: TokenService,
    private readonly emailService: EmailService,
    private readonly invitationService: InvitationService,
  ) {}

  async register(body: RegisterBody): Promise<AuthResponse> {
    if (!isValidPassword(body.password)) {
      throw new BadRequestError(PASSWORD_REQUIREMENTS);
    }

    const email = body.email.toLowerCase();
    const isInvitedRegistration = await this.validateInviteToken(body.inviteToken, email);

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictError("User with this email already exists");
    }

    const passwordHash = await hashPassword(body.password);
    const emailVerificationToken = isInvitedRegistration ? null : randomUUID();

    const user = await this.prisma.user.create({
      data: {
        email,
        firstName: body.firstName,
        lastName: body.lastName,
        passwordHash,
        emailVerified: isInvitedRegistration,
        emailVerificationToken,
        accounts: {
          create: {
            provider: "EMAIL",
            providerAccountId: email,
          },
        },
      },
    });

    if (isInvitedRegistration) {
      void this.invitationService.acceptByToken(body.inviteToken!, user.id);
    } else {
      const verificationUrl = `${this.frontendUrl}/verify-email?token=${emailVerificationToken}`;

      void this.emailService.send({
        to: user.email,
        subject: "Verify your email — DepVault",
        react: VerifyEmailTemplate({ firstName: body.firstName, verificationUrl }),
      });
    }

    void this.invitationService.linkPendingInvitations(email, user.id);

    return this.tokenService.issueTokens(user, "EMAIL", email);
  }

  async login(body: LoginBody): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });

    if (!user || !user.passwordHash || user.deletedAt) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (!user.emailVerified) {
      throw new UnauthorizedError("Please verify your email before logging in");
    }

    const passwordValid = await verifyPassword(body.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    return this.tokenService.issueTokens(user, "EMAIL", user.email);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    let sub: string;
    let sid: string | undefined;
    try {
      ({ sub, sid } = await verifyRefreshToken(refreshToken));
    } catch {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: sub },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedError("User not found");
    }

    if (!sid) {
      throw new UnauthorizedError("Invalid refresh token");
    }

    const session = await this.prisma.authSession.findUnique({ where: { id: sid } });
    if (!session || session.userId !== user.id) {
      throw new UnauthorizedError("Invalid refresh token");
    }

    if (session.expiresAt < new Date()) {
      await this.prisma.authSession.deleteMany({ where: { id: session.id } });
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    const isValid = await verifyPassword(refreshToken, session.refreshTokenHash);
    if (!isValid) {
      // Replay of a rotated token — revoke only this session's family so
      // the user's other devices stay signed in
      await this.prisma.authSession.deleteMany({ where: { id: session.id } });
      logger.warn(
        { userId: user.id, sessionId: session.id },
        "Refresh token replay detected, session revoked",
      );
      throw new UnauthorizedError("Invalid refresh token");
    }

    return this.tokenService.rotateTokens(user, session);
  }

  /**
   * Revokes the session referenced by the presented refresh token.
   * Idempotent and never throws — logout must always succeed client-side.
   */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }

    try {
      const { sub, sid } = await verifyRefreshToken(refreshToken);
      if (sid) {
        await this.prisma.authSession.deleteMany({ where: { id: sid, userId: sub } });
      }
    } catch {
      // Invalid/expired token — nothing to revoke
    }
  }

  async forgotPassword(body: ForgotPasswordBody): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });

    // Always return success to prevent email enumeration
    if (!user || user.deletedAt) {
      return { message: "If an account with that email exists, a reset link has been sent" };
    }

    const resetToken = randomUUID();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS),
      },
    });

    const resetUrl = `${this.frontendUrl}/reset-password?token=${resetToken}`;

    this.emailService.send({
      to: body.email,
      subject: "Reset your password — DepVault",
      react: PasswordResetTemplate({ firstName: user.firstName, resetUrl }),
    });

    return { message: "If an account with that email exists, a reset link has been sent" };
  }

  async resetPassword(body: ResetPasswordBody): Promise<{ message: string }> {
    if (!isValidPassword(body.password)) {
      throw new BadRequestError(PASSWORD_REQUIREMENTS);
    }

    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: body.token,
        passwordResetExpiresAt: { gte: new Date() },
        deletedAt: null,
      },
    });

    if (!user) {
      throw new BadRequestError("Invalid or expired reset token");
    }

    const passwordHash = await hashPassword(body.password);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });

    // Revoke all refresh sessions for security
    await this.prisma.authSession.deleteMany({ where: { userId: user.id } });

    return { message: "Password has been reset successfully" };
  }

  async verifyEmail(body: VerifyEmailBody): Promise<{ message: string }> {
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationToken: body.token,
        emailVerified: false,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new BadRequestError("Invalid or expired verification token");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
      },
    });

    return { message: "Email verified successfully" };
  }

  /** Validates that the invite token exists, is pending, and matches the registration email. */
  private async validateInviteToken(
    inviteToken: string | undefined,
    email: string,
  ): Promise<boolean> {
    if (!inviteToken) return false;

    const invitation = await this.prisma.projectInvitation.findUnique({
      where: { token: inviteToken },
    });

    if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt <= new Date()) {
      return false;
    }

    if (invitation.email.toLowerCase() !== email) {
      throw new BadRequestError("Registration email must match the invitation email");
    }

    return true;
  }
}
