import { randomUUID } from "node:crypto";
import { inject, injectable } from "@needle-di/core";
import { signAccessToken, signRefreshToken } from "@/common/utils/jwt";
import { hashPassword } from "@/common/utils/password";
import { PrismaClient } from "@/generated/prisma";
import type { AuthResponse } from "./auth.schema";
import { refreshTokenTtlSeconds } from "./auth.utils";

interface TokenUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  emailVerified: boolean;
  avatarUrl: string | null;
}

@injectable()
export class TokenService {
  constructor(private readonly prisma = inject(PrismaClient)) {}

  /**
   * Issues a token pair for a new login. The new AuthSession id doubles as the token family,
   * so each device refreshes independently.
   */
  async issueTokens(user: TokenUser): Promise<AuthResponse> {
    const sessionId = randomUUID();
    const { accessToken, refreshToken, refreshTokenHash } = await this.mintPair(user, sessionId);

    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash,
        expiresAt: this.refreshExpiryDate(),
      },
    });

    return this.buildResponse(user, accessToken, refreshToken);
  }

  /**
   * Rotates an existing session's token pair, keeping its `sid` and sliding its expiry to match
   * the new refresh token.
   */
  async rotateTokens(user: TokenUser, sessionId: string): Promise<AuthResponse> {
    const { accessToken, refreshToken, refreshTokenHash } = await this.mintPair(user, sessionId);

    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: {
        refreshTokenHash,
        expiresAt: this.refreshExpiryDate(),
      },
    });

    return this.buildResponse(user, accessToken, refreshToken);
  }

  private async mintPair(user: TokenUser, sessionId: string) {
    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken({ sub: user.id, email: user.email, role: user.role }),
      signRefreshToken(user.id, sessionId),
    ]);

    return { accessToken, refreshToken, refreshTokenHash: await hashPassword(refreshToken) };
  }

  private refreshExpiryDate(): Date {
    return new Date(Date.now() + refreshTokenTtlSeconds() * 1000);
  }

  private buildResponse(user: TokenUser, accessToken: string, refreshToken: string): AuthResponse {
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        emailVerified: user.emailVerified,
        avatarUrl: user.avatarUrl,
      },
    };
  }
}
