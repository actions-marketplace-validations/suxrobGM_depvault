import type { Body, Data } from "@depvault/shared/api";
import type { client } from "@/api/client";

type ProjectById = ReturnType<typeof client.api.projects>;

type Files = ProjectById["files"];
type FileById = ReturnType<Files>;
type VersionByNumber = ReturnType<FileById["versions"]>;

/** Metadata of every file in a project (no ciphertext). */
type RepoFileListResponseDto = Data<Files["get"]>;
export type RepoFileDto = RepoFileListResponseDto["items"][number];

/** A single file with its decryptable blob. */
export type RepoFileContentDto = Data<FileById["get"]>;

type RepoFileVersionListResponseDto = Data<FileById["versions"]["get"]>;
export type RepoFileVersionDto = RepoFileVersionListResponseDto["items"][number];

/** Atomic batch of creates, updates, moves and deletes. */
export type ApplyFileChangesBody = Body<Files["changes"]["post"]>;
export type FileChange = ApplyFileChangesBody["changes"][number];
export type FileContentBody = NonNullable<FileChange["content"]>;

/** Ciphertext of one historical version. */
export type RepoFileVersionContentDto = Data<VersionByNumber["get"]>;
