"use client";

import { useQueryClient } from "@tanstack/react-query";
import { client } from "@/api/client";
import { useApiMutation } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";
import type { ApplyFileChangesBody } from "@/api/types/repo-file";
import { useToast } from "@/hooks/use-toast";

interface UseFileChangesOptions {
  successMessage?: string;
  /** Receives the ids of created, updated and moved files. */
  onSuccess?: (fileIds: string[]) => void;
  /** Called on HTTP 409 (a file changed since its `baseVersion`); defaults to a toast. */
  onConflict?: () => void;
}

export const CONFLICT_MESSAGE =
  "This file changed since you opened it. Reload to get the latest version.";

/**
 * Atomic `/files/changes` batch. Only the touched files' content and history are refetched, so
 * an open draft of another file is never replaced underneath the user.
 */
export function useFileChanges(projectId: string, options: UseFileChangesOptions = {}) {
  const { successMessage, onSuccess, onConflict } = options;
  const toast = useToast();
  const queryClient = useQueryClient();

  const refreshFiles = (fileIds: string[]) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.files.list(projectId) });
    for (const fileId of fileIds) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.files.content(projectId, fileId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.files.versions(projectId, fileId) });
    }
  };

  return useApiMutation(
    (body: ApplyFileChangesBody) => client.api.projects({ id: projectId }).files.changes.post(body),
    {
      invalidateKeys: [queryKeys.projects.stats()],
      successMessage,
      onSuccess: (data) => {
        const fileIds = data.files.map((f) => f.id);
        refreshFiles(fileIds);
        for (const fileId of data.deletedIds) {
          queryClient.removeQueries({ queryKey: queryKeys.files.content(projectId, fileId) });
          queryClient.removeQueries({ queryKey: queryKeys.files.versions(projectId, fileId) });
        }
        onSuccess?.(fileIds);
      },
      onError: (error) => {
        if (error.status === 409) {
          // The list is cheap and holds the versions needed for a retry; content stays as-is.
          refreshFiles([]);
          if (onConflict) onConflict();
          else toast.error(CONFLICT_MESSAGE);
          return;
        }
        toast.error(error.message || "Failed to save changes");
      },
    },
  );
}
