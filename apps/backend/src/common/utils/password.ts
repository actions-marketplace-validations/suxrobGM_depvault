import { createHash, randomBytes } from "node:crypto";
import * as Bun from "bun";

/** Hashes a password with bcrypt (cost 12) via Bun's built-in hasher. */
export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "bcrypt", cost: 12 });
}

/** Verifies a plaintext password against a stored hash. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

/** Generates a cryptographically random hex token of `length` bytes. */
export function createRandomToken(length: number = 32): string {
  return randomBytes(length).toString("hex");
}

/** SHA-256 hex digest of a token, so tokens can be verified without storing them raw. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
