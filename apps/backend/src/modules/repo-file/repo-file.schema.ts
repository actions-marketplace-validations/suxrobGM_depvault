import {
  MAX_CHANGES_PER_REQUEST,
  MAX_FILE_SIZE,
  MAX_PATH_LENGTH,
} from "@depvault/shared/constants";
import { type Static, t } from "elysia";

const MAX_ENCODED_SIZE = Math.ceil((MAX_FILE_SIZE * 4) / 3) + 4;

/** Repo file metadata (no encrypted blob). */
const RepoFileResponseSchema = t.Object({
  id: t.String(),
  path: t.String({ description: "Repo-root-relative path with forward slashes" }),
  version: t.Integer({ description: "Increments on every write; send as `baseVersion` on change" }),
  contentHash: t.String({ description: "Keyed HMAC of the plaintext (opaque to the server)" }),
  fileSize: t.Integer(),
  isBinary: t.Boolean(),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

const EncryptedBlobSchema = t.Object({
  encryptedContent: t.String({
    maxLength: MAX_ENCODED_SIZE,
    description: "Base64-encoded AES-256-GCM ciphertext",
  }),
  iv: t.String({ maxLength: 64 }),
  authTag: t.String({ maxLength: 64 }),
});

/** Repo file metadata plus its client-encrypted blob. */
export const RepoFileContentResponseSchema = t.Composite([
  RepoFileResponseSchema,
  EncryptedBlobSchema,
]);

export const RepoFileListResponseSchema = t.Object({
  items: t.Array(RepoFileResponseSchema),
});

export const RepoFileContentListResponseSchema = t.Object({
  items: t.Array(RepoFileContentResponseSchema),
});

export const DownloadRepoFilesBodySchema = t.Object({
  fileIds: t.Array(t.String({ format: "uuid" }), { maxItems: MAX_CHANGES_PER_REQUEST }),
});

const RepoFileVersionResponseSchema = t.Object({
  version: t.Integer(),
  path: t.String(),
  contentHash: t.String(),
  fileSize: t.Integer(),
  isBinary: t.Boolean(),
  message: t.Nullable(t.String()),
  changedBy: t.Object({
    id: t.String(),
    name: t.String(),
  }),
  createdAt: t.Date(),
});

export const RepoFileVersionListResponseSchema = t.Object({
  items: t.Array(RepoFileVersionResponseSchema),
});

export const RepoFileVersionContentResponseSchema = t.Composite([
  RepoFileVersionResponseSchema,
  EncryptedBlobSchema,
]);

export const RepoFileParamsSchema = t.Object({
  id: t.String(),
  fileId: t.String({ format: "uuid" }),
});

export const RepoFileVersionParamsSchema = t.Object({
  id: t.String(),
  fileId: t.String({ format: "uuid" }),
  version: t.Integer({ minimum: 1 }),
});

const FileContentSchema = t.Composite([
  EncryptedBlobSchema,
  t.Object({
    contentHash: t.String({ minLength: 1, maxLength: 64 }),
    fileSize: t.Integer({ minimum: 0, maximum: MAX_FILE_SIZE }),
    isBinary: t.Boolean({ default: false }),
  }),
]);

/**
 * One change in a batch. Flat on purpose (no oneOf) so generated clients stay simple:
 * - create: no `fileId`; `path` + `content` required.
 * - update / move: `fileId` + `baseVersion`, plus a new `content` and/or a new `path`.
 * - delete: `fileId` + `baseVersion` + `delete: true`.
 */
const RepoFileChangeSchema = t.Object({
  fileId: t.Optional(t.String({ format: "uuid" })),
  baseVersion: t.Optional(t.Integer({ minimum: 1 })),
  path: t.Optional(t.String({ minLength: 1, maxLength: MAX_PATH_LENGTH })),
  content: t.Optional(FileContentSchema),
  delete: t.Optional(t.Boolean()),
});

export const ApplyRepoFileChangesBodySchema = t.Object({
  changes: t.Array(RepoFileChangeSchema, { minItems: 1, maxItems: MAX_CHANGES_PER_REQUEST }),
  message: t.Optional(t.String({ maxLength: 500 })),
});

export const ApplyRepoFileChangesResponseSchema = t.Object({
  files: t.Array(RepoFileResponseSchema, { description: "Created, updated and moved files" }),
  deletedIds: t.Array(t.String()),
});

export type RepoFileResponse = Static<typeof RepoFileResponseSchema>;
export type RepoFileListResponse = Static<typeof RepoFileListResponseSchema>;
export type RepoFileContentListResponse = Static<typeof RepoFileContentListResponseSchema>;
export type RepoFileVersionResponse = Static<typeof RepoFileVersionResponseSchema>;
export type RepoFileVersionListResponse = Static<typeof RepoFileVersionListResponseSchema>;
export type RepoFileContentResponse = Static<typeof RepoFileContentResponseSchema>;
export type RepoFileVersionContentResponse = Static<typeof RepoFileVersionContentResponseSchema>;
export type RepoFileChange = Static<typeof RepoFileChangeSchema>;
export type FileContent = Static<typeof FileContentSchema>;
export type ApplyRepoFileChangesBody = Static<typeof ApplyRepoFileChangesBodySchema>;
export type ApplyRepoFileChangesResponse = Static<typeof ApplyRepoFileChangesResponseSchema>;
