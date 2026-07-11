import { randomUUID } from "crypto";
import { singleton } from "tsyringe";
import { signAccessToken, signRefreshToken } from "@/common/utils/jwt";
import { hashPassword } from "@/common/utils/password";
import { PrismaClient, type AuthProvider } from "@/generated/prisma";
import type { AuthResponse } from "./auth.schema";
import { parseExpiry } from "./auth.utils";

const REFRESH_TOKEN_FALLBACK_SECONDS = 7 * 24 * 60 * 60;

interface TokenUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  emailVerified: boolean;
  avatarUrl: string | null;
}

@singleton()
export class TokenService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Issues a fresh access/refresh token pair for a new login session.
   * Creates an AuthSession row whose id doubles as the token family,
   * so each device/surface refreshes independently.
   */
  async issueTokens(
    user: TokenUser,
    provider: AuthProvider,
    accountId: string,
  ): Promise<AuthResponse> {
    const sessionId = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken({ sub: user.id, email: user.email, role: user.role }),
      signRefreshToken(user.id, sessionId),
    ]);

    const refreshTokenHash = await hashPassword(refreshToken);
    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        provider,
        providerAccountId: accountId,
        refreshTokenHash,
        expiresAt: this.refreshExpiryDate(),
      },
    });

    return this.buildResponse(user, accessToken, refreshToken);
  }

  /**
   * Rotates the token pair of an existing session in place, keeping the
   * same session id (`sid` claim) and sliding its expiry forward to match
   * the newly signed refresh token.
   */
  async rotateTokens(user: TokenUser, session: { id: string }): Promise<AuthResponse> {
    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken({ sub: user.id, email: user.email, role: user.role }),
      signRefreshToken(user.id, session.id),
    ]);

    const refreshTokenHash = await hashPassword(refreshToken);
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash,
        expiresAt: this.refreshExpiryDate(),
        lastUsedAt: new Date(),
      },
    });

    return this.buildResponse(user, accessToken, refreshToken);
  }

  private refreshExpiryDate(): Date {
    const seconds = parseExpiry(process.env.REFRESH_TOKEN_EXPIRY, REFRESH_TOKEN_FALLBACK_SECONDS);
    return new Date(Date.now() + seconds * 1000);
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
