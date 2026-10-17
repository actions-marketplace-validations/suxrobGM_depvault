import { jwtVerify, SignJWT } from "jose";
import { env } from "@/env";

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

function getSecret(): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

/** Signs a short-lived HS256 access token (`type: "access"`) carrying sub, email, and role. */
export async function signAccessToken(payload: JwtPayload): Promise<string> {
  const expiry = env.JWT_EXPIRY;

  return new SignJWT({ email: payload.email, role: payload.role, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(getSecret());
}

/**
 * Signs a long-lived HS256 refresh token (`type: "refresh"`).
 * @param sessionId AuthSession id, embedded as the `sid` claim (token family)
 */
export async function signRefreshToken(userId: string, sessionId: string): Promise<string> {
  const expiry = env.REFRESH_TOKEN_EXPIRY;

  return new SignJWT({ type: "refresh", sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(getSecret());
}

/**
 * Verifies a refresh token's signature, `type` claim, and session binding.
 * @returns The user id (`sub`) and AuthSession id (`sid`)
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
