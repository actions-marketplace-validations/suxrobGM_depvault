import { beforeAll, describe, expect, it } from "bun:test";
import { SignJWT } from "jose";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "./jwt";

const SECRET = "test-jwt-secret-for-unit-tests";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(SECRET);
}

/** Signs a refresh-typed token directly so we can omit claims the public signer always sets. */
function signRaw(claims: Record<string, unknown>, subject: string): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

describe("verifyRefreshToken", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });

  it("should return the subject and session id of a valid refresh token", async () => {
    const token = await signRefreshToken("user-uuid", "session-uuid");

    expect(await verifyRefreshToken(token)).toEqual({ sub: "user-uuid", sid: "session-uuid" });
  });

  it("should reject a token that is not session-bound", async () => {
    const token = await signRaw({ type: "refresh" }, "user-uuid");

    expect(verifyRefreshToken(token)).rejects.toThrow("Refresh token is not session-bound");
  });

  it("should reject a token whose sid claim is not a string", async () => {
    const token = await signRaw({ type: "refresh", sid: 42 }, "user-uuid");

    expect(verifyRefreshToken(token)).rejects.toThrow("Refresh token is not session-bound");
  });

  it("should reject an access token", async () => {
    const token = await signAccessToken({ sub: "user-uuid", email: "a@b.c", role: "USER" });

    expect(verifyRefreshToken(token)).rejects.toThrow("Invalid token type");
  });

  it("should reject a token signed with a different secret", async () => {
    const token = await new SignJWT({ type: "refresh", sid: "session-uuid" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-uuid")
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode("some-other-secret"));

    expect(verifyRefreshToken(token)).rejects.toThrow();
  });
});
