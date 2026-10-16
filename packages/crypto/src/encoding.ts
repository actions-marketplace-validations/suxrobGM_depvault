/** PBKDF2-SHA256 iteration count for KEK derivation; the single source for vault payloads. */
export const PBKDF2_ITERATIONS = 600_000;
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12;
const HKDF_CI_INFO = "depvault-ci-wrap";

export const CRYPTO_CONSTANTS = {
  PBKDF2_ITERATIONS,
  AES_KEY_LENGTH,
  IV_LENGTH,
  HKDF_CI_INFO,
};

// `String.fromCharCode(...bytes)` exceeds the argument limit on large arrays.
const BASE64_CHUNK = 0x8000;

/** Encode bytes as standard base64. Accepts buffers and views (offset/length respected). */
export function toBase64(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
}

/** Convert a base64 string to a Uint8Array. */
export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Base64url encoding: URL-safe characters and no padding. */
export function toBase64Url(data: Uint8Array | ArrayBuffer): string {
  return toBase64(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Convert a base64url string to a Uint8Array. */
export function fromBase64Url(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  return fromBase64(pad ? b64 + "=".repeat(4 - pad) : b64);
}

/** Generate cryptographically random bytes. */
export function getRandomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}
