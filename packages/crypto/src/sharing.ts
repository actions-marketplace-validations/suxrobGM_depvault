/** Ephemeral key operations for one-time share links. */

import { encryptBinary } from "./aes-gcm";
import { fromBase64Url, getRandomBytes, toBase64Url } from "./encoding";
import { importAesKey } from "./keys";

export interface EncryptedShare {
  encryptedPayload: string;
  iv: string;
  authTag: string;
  /** Base64url share key for the URL fragment; never sent to the server. */
  fragment: string;
}

/** Encrypt a file under a fresh one-time share key. */
export async function encryptForShare(content: string | ArrayBuffer): Promise<EncryptedShare> {
  const raw = getRandomBytes(32);
  const key = await importAesKey(raw, false);
  const data = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const sealed = await encryptBinary(data, key);
  return {
    encryptedPayload: sealed.ciphertext,
    iv: sealed.iv,
    authTag: sealed.authTag,
    fragment: toBase64Url(raw),
  };
}

/** Recover a share key from the URL fragment (base64url-encoded raw bytes). */
export async function shareKeyFromFragment(fragment: string): Promise<CryptoKey> {
  return importAesKey(fromBase64Url(fragment), false);
}
