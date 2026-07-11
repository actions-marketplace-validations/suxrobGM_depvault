import { jwtVerify, SignJWT } from "jose";

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

function getSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET!);
}

/**
 * Signs a short-lived access token (HS256) containing user identity claims.
 * @param payload User identity — sub (user ID), email, and role
 * @returns Signed JWT string with `type: "access"` claim
 */
export async function signAccessToken(payload: JwtPayload): Promise<string> {
  const expiry = process.env.JWT_EXPIRY ?? "1d";

  return new SignJWT({ email: payload.email, role: payload.role, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(getSecret());
}

/**
 * Signs a long-lived refresh token (HS256) used to obtain new access tokens.
 * @param userId The user's UUID to embed as the JWT subject
 * @param sessionId The AuthSession UUID embedded as the `sid` claim (token family)
 * @returns Signed JWT string with `type: "refresh"` claim
 */
export async function signRefreshToken(userId: string, sessionId: string): Promise<string> {
  const expiry = process.env.REFRESH_TOKEN_EXPIRY ?? "7d";

  return new SignJWT({ type: "refresh", sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(getSecret());
}

/**
 * Verifies a refresh token's signature, `type` claim, and session binding.
 * @param token The raw refresh token JWT string
 * @returns The user's UUID as `sub` and the AuthSession UUID as `sid`
 * @throws {Error} If the token is invalid, expired, not a refresh token, or not session-bound
 */
export async function verifyRefreshToken(token: string): Promise<{ sub: string; sid: string }> {
  const { payload } = await jwtVerify(token, getSecret());

  if (payload.type !== "refresh") {
    throw new Error("Invalid token type");
  }

  if (typeof payload.sid !== "string") {
    throw new Error("Refresh token is not session-bound");
  }

  return { sub: payload.sub as string, sid: payload.sid };
}
