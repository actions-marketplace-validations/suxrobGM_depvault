import type { RepoFile } from "@/generated/prisma";
import type { RepoFileContentResponse, RepoFileResponse } from "./repo-file.schema";

/** Map a RepoFile row to the metadata response shape. */
export function toRepoFileResponse(file: RepoFile): RepoFileResponse {
  return {
    id: file.id,
    path: file.path,
    version: file.version,
    contentHash: file.contentHash,
    fileSize: file.fileSize,
    isBinary: file.isBinary,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}

/** Map a RepoFile row to the content response (metadata + base64 blob). */
export function toRepoFileContentResponse(file: RepoFile): RepoFileContentResponse {
  return {
    ...toRepoFileResponse(file),
    encryptedContent: Buffer.from(file.encryptedContent).toString("base64"),
    iv: file.iv,
    authTag: file.authTag,
  };
}
