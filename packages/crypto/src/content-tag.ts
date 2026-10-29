/**
 * Keyed content tag: HMAC-SHA256(HKDF(DEK, info = "depvault-content-tag"), plaintext), base64.
 * Lets clients detect changed or renamed files from server metadata without the server learning
 * anything about the content. Must match the CLI's `VaultCrypto.ComputeContentTag`.
 */

import { toBase64 } from "./encoding";

const CONTENT_TAG_INFO = new TextEncoder().encode("depvault-content-tag");

/** Derived tag keys per DEK, so tagging a batch of files exports and derives only once. */
const tagKeyCache = new WeakMap<CryptoKey, Promise<CryptoKey>>();

async function deriveTagKey(dek: CryptoKey): Promise<CryptoKey> {
  const rawDek = await crypto.subtle.exportKey("raw", dek);
  const hkdfKey = await crypto.subtle.importKey("raw", rawDek, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: CONTENT_TAG_INFO },
    hkdfKey,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
}

function getTagKey(dek: CryptoKey): Promise<CryptoKey> {
  let tagKey = tagKeyCache.get(dek);
  if (!tagKey) {
    tagKey = deriveTagKey(dek);
    // A failed derivation must not poison later calls with the same DEK.
    tagKey.catch(() => tagKeyCache.delete(dek));
    tagKeyCache.set(dek, tagKey);
  }
  return tagKey;
}

/** Compute the content tag of a file's plaintext under an (extractable) project DEK. */
export async function computeContentTag(
  plaintext: Uint8Array<ArrayBuffer>,
  dek: CryptoKey,
): Promise<string> {
  return toBase64(await crypto.subtle.sign("HMAC", await getTagKey(dek), plaintext));
}
