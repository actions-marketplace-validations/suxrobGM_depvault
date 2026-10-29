import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { isValidPassword, PASSWORD_REQUIREMENTS } from "@depvault/shared/utils";
import { inject, injectable } from "@needle-di/core";
import { EmailChangeVerificationTemplate } from "@/common/emails";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "@/common/errors/http.error";
import { EmailService } from "@/common/services/email.service";
import { verifyRefreshToken } from "@/common/utils/jwt";
import { hashPassword, verifyPassword } from "@/common/utils/password";
import { env } from "@/env";
import { PrismaClient, type User } from "@/generated/prisma";
import { ownedBy } from "@/modules/project/project-ownership";
import type {
  ChangeEmailBody,
  ChangePasswordBody,
  UpdateProfileBody,
  UserProfileResponse,
} from "./user.schema";

const AVATAR_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const avatarsDir = (): string => resolve(env.UPLOAD_DIR, "avatars");

/** Deletes a stored avatar; only the file name of the URL is trusted. */
function removeAvatarFile(avatarUrl: string | null): void {
  if (!avatarUrl) return;
  const path = resolve(avatarsDir(), basename(avatarUrl));
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

const toProfile = (user: User): UserProfileResponse => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.role,
  avatarUrl: user.avatarUrl,
  emailVerified: user.emailVerified,
  githubId: user.githubId,
  githubUsername: user.githubUsername,
  hasPassword: !!user.passwordHash,
  createdAt: user.createdAt.toISOString(),
});

@injectable()
export class UserService {
  constructor(
    private readonly prisma = inject(PrismaClient),
    private readonly emailService = inject(EmailService),
  ) {}

  async getProfile(userId: string): Promise<UserProfileResponse> {
    return toProfile(await this.findUser(userId));
  }

  async updateProfile(userId: string, body: UpdateProfileBody): Promise<UserProfileResponse> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.firstName !== undefined && { firstName: body.firstName }),
        ...(body.lastName !== undefined && { lastName: body.lastName }),
        ...(body.avatarUrl !== undefined && { avatarUrl: body.avatarUrl }),
      },
    });

    return toProfile(user);
  }

  async uploadAvatar(userId: string, file: File): Promise<{ avatarUrl: string }> {
    if (!(file.type in AVATAR_EXTENSIONS)) {
      throw new BadRequestError("Only jpg, png, gif, and webp images are allowed");
    }

    const user = await this.findUser(userId);

    mkdirSync(avatarsDir(), { recursive: true });
    removeAvatarFile(user.avatarUrl);

    const ext = extname(file.name) || AVATAR_EXTENSIONS[file.type]!;
    const filename = `${userId}-${Date.now()}${ext}`;
    writeFileSync(resolve(avatarsDir(), filename), Buffer.from(await file.arrayBuffer()));

    const avatarUrl = `/uploads/avatars/${filename}`;
    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl } });

    return { avatarUrl };
  }

  /**
   * Changes the password and signs out every other session.
   * @param refreshToken The caller's refresh token cookie; its session is kept (empty for CLI)
   */
  async changePassword(
    userId: string,
    body: ChangePasswordBody,
    refreshToken: string,
  ): Promise<{ message: string }> {
    if (!isValidPassword(body.newPassword)) {
      throw new BadRequestError(PASSWORD_REQUIREMENTS);
    }

    const user = await this.findUser(userId);

    if (user.passwordHash) {
      if (!body.currentPassword) {
        throw new BadRequestError("Current password is required");
      }
      const isValid = await verifyPassword(body.currentPassword, user.passwordHash);
      if (!isValid) {
        throw new UnauthorizedError("Current password is incorrect");
      }
    }

    const currentSessionId = await verifyRefreshToken(refreshToken).then(
      ({ sub, sid }) => (sub === userId ? sid : null),
      () => null,
    );

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await hashPassword(body.newPassword) },
      }),
      this.prisma.authSession.deleteMany({
        where: { userId, ...(currentSessionId && { id: { not: currentSessionId } }) },
      }),
    ]);

    return { message: "Password changed successfully" };
  }

  async changeEmail(userId: string, body: ChangeEmailBody): Promise<{ message: string }> {
    const user = await this.findUser(userId);

    if (!user.passwordHash) {
      throw new BadRequestError("Cannot change email for OAuth-only accounts");
    }

    const isValid = await verifyPassword(body.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError("Password is incorrect");
    }

    const newEmail = body.newEmail.toLowerCase();

    const existing = await this.prisma.user.findFirst({
      where: { email: newEmail, id: { not: userId } },
    });

    if (existing) {
      throw new ConflictError("Email is already in use");
    }

    const emailVerificationToken = randomUUID();

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: newEmail,
        emailVerified: false,
        emailVerificationToken,
      },
    });

    const verificationUrl = `${env.FRONTEND_URL}/verify-email?token=${emailVerificationToken}`;

    void this.emailService.send({
      to: newEmail,
      subject: "Verify your new DepVault email",
      react: EmailChangeVerificationTemplate({
        firstName: user.firstName,
        newEmail,
        verificationUrl,
      }),
    });

    return { message: "Email updated. Please verify your new email address" };
  }

  /**
   * Deletes the user and every project they own in one transaction. Their footprint in other
   * projects survives with the author cleared (files, analyses, scans, audit entries); their CI
   * tokens, share links, and invitations go with them.
   */
  async deleteAccount(userId: string): Promise<{ message: string }> {
    const user = await this.findUser(userId);

    await this.prisma.$transaction([
      this.prisma.project.deleteMany({ where: ownedBy(userId) }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);

    removeAvatarFile(user.avatarUrl);

    return { message: "Account permanently deleted" };
  }

  private async findUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  }
}
