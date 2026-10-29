/**
 * Key Encryption Key (KEK) derivation, Data Encryption Key (DEK) lifecycle,
 * and AES-GCM key wrapping/unwrapping.
 */

import { decryptBinary, encryptBinary } from "./aes-gcm";
import { AES_KEY_LENGTH, getRandomBytes, PBKDF2_ITERATIONS } from "./encoding";

/** Derive a Key Encryption Key from a vault password and salt using PBKDF2-SHA256. */
export async function deriveKEK(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Generate a random salt for PBKDF2 (16 bytes). */
export function generateSalt(): Uint8Array<ArrayBuffer> {
  return getRandomBytes(16);
}

/** Import raw bytes as an AES-256-GCM key. */
export async function importAesKey(
  raw: Uint8Array<ArrayBuffer>,
  extractable: boolean,
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    extractable,
    ["encrypt", "decrypt"],
  );
}

/**
 * Generate a random AES-256-GCM Data Encryption Key. DEKs stay extractable: they're re-wrapped
 * for other members, CI tokens and recovery, and seed the content-tag key.
 */
export async function generateDEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: AES_KEY_LENGTH }, true, [
    "encrypt",
    "decrypt",
  ]);
}

/** Export a DEK to raw bytes. */
export async function exportDEK(dek: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.exportKey("raw", dek));
}

/** Import raw bytes as an AES-256-GCM DEK. */
export async function importDEK(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return importAesKey(raw, true);
}

export interface WrappedKey {
  wrapped: string;
  iv: string;
  tag: string;
}

/** Wrap (encrypt) a raw key with a wrapping key using AES-GCM. */
export async function wrapKey(
  keyBytes: Uint8Array<ArrayBuffer>,
  wrappingKey: CryptoKey,
): Promise<WrappedKey> {
  const sealed = await encryptBinary(keyBytes, wrappingKey);
  return { wrapped: sealed.ciphertext, iv: sealed.iv, tag: sealed.authTag };
}

/** Unwrap (decrypt) a wrapped key using AES-GCM. */
export async function unwrapKey(
  wrapped: string,
  iv: string,
  tag: string,
  wrappingKey: CryptoKey,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await decryptBinary(wrapped, iv, tag, wrappingKey));
}

/** A DEK wrapped for storage, in the field names the API uses for grants and CI tokens. */
export interface WrappedDek {
  wrappedDek: string;
  wrappedDekIv: string;
  wrappedDekTag: string;
}

/** Wrap a DEK under `wrappingKey` (KEK, recovery key, ECDH secret or CI wrap key). */
export async function wrapDek(dek: CryptoKey, wrappingKey: CryptoKey): Promise<WrappedDek> {
  const { wrapped, iv, tag } = await wrapKey(await exportDEK(dek), wrappingKey);
  return { wrappedDek: wrapped, wrappedDekIv: iv, wrappedDekTag: tag };
}

/** Unwrap a stored DEK. Throws when `wrappingKey` isn't the one it was wrapped under. */
export async function unwrapDek(stored: WrappedDek, wrappingKey: CryptoKey): Promise<CryptoKey> {
  const raw = await unwrapKey(
    stored.wrappedDek,
    stored.wrappedDekIv,
    stored.wrappedDekTag,
    wrappingKey,
  );
  return importDEK(raw);
}
