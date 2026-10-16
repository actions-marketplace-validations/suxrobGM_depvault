import type { Body, Data } from "@depvault/shared/api";
import type { client } from "@/api/client";

type ProjectById = ReturnType<typeof client.api.projects>;

type Files = ProjectById["files"];
type FileById = ReturnType<Files>;

/** Apps grouped under a project. */
export type AppListResponseDto = Data<ProjectById["apps"]["get"]>;

/** Full repository tree: apps with their config + secret file metadata. */
export type RepoMapResponseDto = Data<ProjectById["repo-map"]["get"]>;
export type RepoMapAppDto = RepoMapResponseDto["apps"][number];
export type RepoMapFileDto = RepoMapAppDto["files"][number];

/** A single repo file with its decryptable blob. */
export type RepoFileContentDto = Data<FileById["get"]>;

/** Repo-file version metadata list. */
export type RepoFileVersionListResponseDto = Data<FileById["versions"]["get"]>;
export type RepoFileVersionDto = RepoFileVersionListResponseDto["items"][number];

/** Body for saving a new file revision from the web editor. */
export type SaveRepoFileBody = Body<FileById["put"]>;
