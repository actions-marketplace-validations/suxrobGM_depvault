/** Recovery key generation, parsing, and import. */

import { fromUnpaddedBase64, getRandomBytes, toBase64 } from "./encoding";
import { importAesKey } from "./keys";

export interface RecoveryKey {
  /** Raw 256-bit key, wrapped under the KEK for storage. */
  bytes: Uint8Array<ArrayBuffer>;
  /** Non-extractable AES-GCM key that wraps RECOVERY grants. */
  key: CryptoKey;
  /** SHA-256 (base64) the server checks to authorize a recovery. */
  hash: string;
}

export interface GeneratedRecoveryKey extends RecoveryKey {
  /** Display form (groups of 4 base64 chars), shown to the user once. */
  formatted: string;
}

/** Generate a fresh recovery key. */
export async function createRecoveryKey(): Promise<GeneratedRecoveryKey> {
  const b64 = toBase64(getRandomBytes(32)).replace(/=+$/, "");
  const formatted = b64.match(/.{1,4}/g)!.join("-");
  return { formatted, ...(await parseRecoveryKey(formatted)) };
}

/** Parse a recovery key typed by the user. */
export async function parseRecoveryKey(formatted: string): Promise<RecoveryKey> {
  const bytes = fromUnpaddedBase64(formatted.trim().replace(/-/g, ""));
  return importRecoveryKeyBytes(bytes);
}

/** Import recovery key bytes, e.g. after unwrapping them with the KEK. */
export async function importRecoveryKeyBytes(bytes: Uint8Array<ArrayBuffer>): Promise<RecoveryKey> {
  const [key, digest] = await Promise.all([
    importAesKey(bytes, false),
    crypto.subtle.digest("SHA-256", bytes),
  ]);
  return { bytes, key, hash: toBase64(digest) };
}
