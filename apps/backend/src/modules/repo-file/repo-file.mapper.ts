import type { RepoFile } from "@/generated/prisma";
import type { RepoFileSummary, RepoFileVersionSummary } from "./repo-file.repository";
import type {
  RepoFileContentResponse,
  RepoFileResponse,
  RepoFileVersionResponse,
} from "./repo-file.schema";

/** Map a RepoFile row to the metadata response shape. */
export function toRepoFileResponse(file: RepoFileSummary): RepoFileResponse {
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

/** Map a version row to its metadata response, naming its author (`names` keyed by user id). */
export function toRepoFileVersionResponse(
  row: RepoFileVersionSummary,
  names: Map<string, string>,
): RepoFileVersionResponse {
  return {
    version: row.version,
    path: row.path,
    contentHash: row.contentHash,
    fileSize: row.fileSize,
    isBinary: row.isBinary,
    message: row.message,
    changedBy: { id: row.changedBy, name: names.get(row.changedBy) ?? "Deleted user" },
    createdAt: row.createdAt,
  };
}
