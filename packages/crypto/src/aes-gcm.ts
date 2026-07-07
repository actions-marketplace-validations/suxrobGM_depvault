/** High-level AES-256-GCM encrypt/decrypt for strings and binary data. */

import { CRYPTO_CONSTANTS, fromBase64, getRandomBytes, toBase64 } from "./encoding";

const { IV_LENGTH } = CRYPTO_CONSTANTS;
const AUTH_TAG_LENGTH = 16;

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/** Encrypt binary data with AES-256-GCM, splitting the trailing auth tag into its own field. */
export async function encryptBinary(
  data: ArrayBuffer | Uint8Array<ArrayBuffer>,
  dek: CryptoKey,
): Promise<EncryptedData> {
  const iv = getRandomBytes(IV_LENGTH);
  const result = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dek, data));

  return {
    ciphertext: toBase64(result.subarray(0, result.length - AUTH_TAG_LENGTH)),
    iv: toBase64(iv),
    authTag: toBase64(result.subarray(result.length - AUTH_TAG_LENGTH)),
  };
}

/** Decrypt base64-encoded AES-256-GCM fields (ciphertext + separate auth tag) back to bytes. */
export async function decryptBinary(
  ciphertext: string,
  iv: string,
  authTag: string,
  dek: CryptoKey,
): Promise<ArrayBuffer> {
  const ct = fromBase64(ciphertext);
  const tag = fromBase64(authTag);

  const combined = new Uint8Array(ct.length + tag.length);
  combined.set(ct);
  combined.set(tag, ct.length);

  return crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, dek, combined);
}

/** Encrypt a UTF-8 string with AES-256-GCM. Returns base64-encoded fields. */
export async function encrypt(plaintext: string, dek: CryptoKey): Promise<EncryptedData> {
  return encryptBinary(new TextEncoder().encode(plaintext), dek);
}

/** Decrypt a base64-encoded AES-256-GCM ciphertext back to a UTF-8 string. */
export async function decrypt(
  ciphertext: string,
  iv: string,
  authTag: string,
  dek: CryptoKey,
): Promise<string> {
  return new TextDecoder().decode(await decryptBinary(ciphertext, iv, authTag, dek));
}
