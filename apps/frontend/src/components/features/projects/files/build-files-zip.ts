import { type Zippable, zip } from "fflate";
import { client } from "@/api/client";
import { decryptFileBytes } from "./file-crypto";

/** Mirrors the backend's `/files/download` limit; larger projects take one request per chunk. */
const DOWNLOAD_BATCH_SIZE = 200;

/**
 * Downloads every file's ciphertext in bulk, decrypts it client-side with the project DEK and
 * zips the plaintext by path (unique per project). The server never sees plaintext.
 */
export async function buildFilesZip(
  projectId: string,
  fileIds: string[],
  dek: CryptoKey,
): Promise<ArrayBuffer> {
  const zippable: Zippable = {};

  for (let start = 0; start < fileIds.length; start += DOWNLOAD_BATCH_SIZE) {
    const { data, error } = await client.api
      .projects({ id: projectId })
      .files.download.post({ fileIds: fileIds.slice(start, start + DOWNLOAD_BATCH_SIZE) });
    if (error || !data) throw new Error("Failed to download files");

    for (const file of data.items) {
      zippable[file.path] = new Uint8Array(await decryptFileBytes(file, dek));
    }
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    zip(zippable, (err, data) => {
      if (err) reject(err);
      // Copy: fflate's view may sit on a larger buffer, and this narrows away SharedArrayBuffer.
      else resolve(new Uint8Array(data).buffer);
    });
  });
}
