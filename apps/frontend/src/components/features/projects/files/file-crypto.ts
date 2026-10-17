import { computeContentTag, decryptBinary, encryptBinary } from "@depvault/crypto";
import type { FileContentBody } from "@/api/types/repo-file";

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const BINARY_SNIFF_BYTES = 8000;

interface EncryptedBlob {
  encryptedContent: string;
  iv: string;
  authTag: string;
}

/** Local view model: decrypted text plus what is needed to re-encode it byte-for-byte. */
export interface DecodedText {
  text: string;
  hasBom: boolean;
}

/** Encrypts plaintext bytes into a change `content` body, tagged so CLI clients detect changes. */
export async function encryptFileContent(
  bytes: Uint8Array<ArrayBuffer>,
  isBinary: boolean,
  dek: CryptoKey,
): Promise<FileContentBody> {
  const [encrypted, contentHash] = await Promise.all([
    encryptBinary(bytes, dek),
    computeContentTag(bytes, dek),
  ]);
  return {
    encryptedContent: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    contentHash,
    fileSize: bytes.byteLength,
    isBinary,
  };
}

export function decryptFileBytes(blob: EncryptedBlob, dek: CryptoKey): Promise<ArrayBuffer> {
  return decryptBinary(blob.encryptedContent, blob.iv, blob.authTag, dek);
}

/** UTF-8 decode that remembers a leading BOM, so saving doesn't silently drop it. */
export function decodeText(buffer: ArrayBuffer): DecodedText {
  const bytes = new Uint8Array(buffer);
  const hasBom = UTF8_BOM.every((b, i) => bytes[i] === b);
  return { text: new TextDecoder().decode(bytes), hasBom };
}

export function encodeText(text: string, hasBom: boolean): Uint8Array<ArrayBuffer> {
  const body = new TextEncoder().encode(text);
  if (!hasBom) return body;
  const out = new Uint8Array(body.length + UTF8_BOM.length);
  out.set(UTF8_BOM);
  out.set(body, UTF8_BOM.length);
  return out;
}

/** Treats content as binary when it has NUL bytes or is not valid UTF-8. */
export function looksBinary(bytes: Uint8Array): boolean {
  if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return true;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return false;
  } catch {
    return true;
  }
}
