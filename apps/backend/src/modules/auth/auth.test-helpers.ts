import { mock } from "bun:test";
import type { EmailService } from "@/common/services/email.service";
import { signRefreshToken } from "@/common/utils/jwt";
import { env } from "@/env";
import type { PrismaClient } from "@/generated/prisma";
import type { InvitationService } from "@/modules/invitation/invitation.service";
import type { DeepMockProxy } from "@/types/deep-mock";
import { AuthService } from "./auth.service";
import type { TokenService } from "./token.service";

// The real signer/verifier is used: it is pure and fast, and mocking it would replace the module
// globally for every other test file in the run.
env.JWT_SECRET = "test-jwt-secret-for-unit-tests";

export const validRefreshToken = await signRefreshToken("user-uuid", "session-uuid");

// bcrypt at cost 12 is far too slow for a unit test.
mock.module("@/common/utils/password", () => ({
  hashPassword: () => Promise.resolve("hashed-password"),
  verifyPassword: (plain: string, hash: string) =>
    Promise.resolve(
      (plain === validRefreshToken && hash === "hashed-refresh-token") ||
        (plain === "Password1" && hash === "hashed-password"),
    ),
}));

mock.module("@/common/logger/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

export const verifiedUser = {
  id: "user-uuid",
  email: "test@example.com",
  firstName: "Test",
  lastName: "User",
  role: "USER",
  emailVerified: true,
  passwordHash: "hashed-password",
};

const mockAuthResponse = {
  accessToken: "mock-access-token",
  refreshToken: "mock-refresh-token",
  user: { ...verifiedUser, emailVerified: false, avatarUrl: null },
};

function createMockPrisma() {
  return {
    user: {
      findFirst: mock(() => Promise.resolve(null)),
      findUnique: mock(() => Promise.resolve(null)),
      create: mock(() => Promise.resolve({ ...verifiedUser, emailVerified: false })),
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

/** An AuthService wired to fresh mocks, plus the mocks for assertions. */
export function createAuthService() {
  const prisma = createMockPrisma();
  const tokenService = {
    issueTokens: mock(() => Promise.resolve(mockAuthResponse)),
    rotateTokens: mock(() => Promise.resolve(mockAuthResponse)),
  } as unknown as DeepMockProxy<TokenService>;
  const emailService = {
    send: mock(() => Promise.resolve()),
  } as unknown as DeepMockProxy<EmailService>;
  const invitationService = {
    linkPendingInvitations: mock(() => Promise.resolve()),
  } as unknown as InvitationService;

  const service = new AuthService(
    prisma,
    tokenService as unknown as TokenService,
    emailService as unknown as EmailService,
    invitationService,
  );
  return { service, prisma, tokenService, emailService };
}
