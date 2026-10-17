/**
 * Keyed content tag: HMAC-SHA256(HKDF(DEK, info = "depvault-content-tag"), plaintext), base64.
 * Lets clients detect changed or renamed files from server metadata without the server learning
 * anything about the content. Must match the CLI's `VaultCrypto.ComputeContentTag`.
 */

import { toBase64 } from "./encoding";

const CONTENT_TAG_INFO = new TextEncoder().encode("depvault-content-tag");

/** Compute the content tag of a file's plaintext under an (extractable) project DEK. */
export async function computeContentTag(
  plaintext: Uint8Array<ArrayBuffer>,
  dek: CryptoKey,
): Promise<string> {
  const rawDek = await crypto.subtle.exportKey("raw", dek);
  const hkdfKey = await crypto.subtle.importKey("raw", rawDek, "HKDF", false, ["deriveKey"]);
  const tagKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: CONTENT_TAG_INFO },
    hkdfKey,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );

  return toBase64(await crypto.subtle.sign("HMAC", tagKey, plaintext));
}
