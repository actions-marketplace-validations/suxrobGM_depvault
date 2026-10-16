import { decryptBinary, decrypt as decryptText } from "@depvault/crypto";
import { type Zippable, zip } from "fflate";
import { client } from "@/api/client";
import type { RepoMapFileDto } from "@/api/types/repo";

/**
 * Decrypts every repo file client-side with the project DEK and zips them by `relativePath`
 * (unique per project, so no collisions). The server never sees plaintext.
 */
export async function buildVaultZip(
  projectId: string,
  files: RepoMapFileDto[],
  getProjectDEK: (projectId: string) => Promise<CryptoKey>,
): Promise<ArrayBuffer> {
  const dek = await getProjectDEK(projectId);

  const entries = await Promise.all(
    files.map(async (file): Promise<[string, Uint8Array]> => {
      const { data } = await client.api
        .projects({ id: projectId })
        .files({ fileId: file.id })
        .get();
      if (!data) {
        throw new Error(`Failed to fetch "${file.relativePath}"`);
      }

      if (file.isBinary) {
        const buffer = await decryptBinary(data.encryptedContent, data.iv, data.authTag, dek);
        return [file.relativePath, new Uint8Array(buffer)];
      }

      const text = await decryptText(data.encryptedContent, data.iv, data.authTag, dek);
      return [file.relativePath, new TextEncoder().encode(text)];
    }),
  );

  const zippable: Zippable = Object.fromEntries(entries);

  return new Promise<ArrayBuffer>((resolve, reject) => {
    zip(zippable, (err, data) => {
      if (err) reject(err);
      // Copy: fflate's view may sit on a larger buffer, and this narrows away SharedArrayBuffer.
      else resolve(new Uint8Array(data).buffer);
    });
  });
}
