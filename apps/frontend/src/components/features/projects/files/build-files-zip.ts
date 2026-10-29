import { MAX_CHANGES_PER_REQUEST } from "@depvault/shared/constants";
import { type Zippable, zip } from "fflate";
import { client } from "@/api/client";
import { decryptFileBytes } from "./file-crypto";

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

  // `/files/download` takes at most MAX_CHANGES_PER_REQUEST ids, so large projects are chunked.
  for (let start = 0; start < fileIds.length; start += MAX_CHANGES_PER_REQUEST) {
    const { data, error } = await client.api
      .projects({ id: projectId })
      .files.download.post({ fileIds: fileIds.slice(start, start + MAX_CHANGES_PER_REQUEST) });
    if (error || !data) throw new Error("Failed to download files");

    const entries = await Promise.all(
      data.items.map(
        async (file) => [file.path, new Uint8Array(await decryptFileBytes(file, dek))] as const,
      ),
    );
    for (const [path, bytes] of entries) zippable[path] = bytes;
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    zip(zippable, (err, data) => {
      if (err) reject(err);
      // Copy: fflate's view may sit on a larger buffer, and this narrows away SharedArrayBuffer.
      else resolve(new Uint8Array(data).buffer);
    });
  });
}
