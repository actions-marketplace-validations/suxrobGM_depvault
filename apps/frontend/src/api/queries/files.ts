"use client";

import { client } from "@/api/client";
import { useApiQuery } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";

/** Metadata of every file in a project (no ciphertext). */
export function useProjectFiles(projectId: string) {
  return useApiQuery(queryKeys.files.list(projectId), () =>
    client.api.projects({ id: projectId }).files.get(),
  );
}

/** One file with its encrypted blob. */
export function useFileContent(projectId: string, fileId: string) {
  return useApiQuery(queryKeys.files.content(projectId, fileId), () =>
    client.api.projects({ id: projectId }).files({ fileId }).get(),
  );
}

/** A file's version history, newest first. */
export function useFileVersions(projectId: string, fileId: string) {
  return useApiQuery(queryKeys.files.versions(projectId, fileId), () =>
    client.api.projects({ id: projectId }).files({ fileId }).versions.get(),
  );
}
