"use client";

import { useQueryClient } from "@tanstack/react-query";
import { client } from "@/api/client";
import { useApiMutation } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";
import type { ApplyFileChangesBody, RepoFileContentDto } from "@/api/types/repo-file";
import { useToast } from "@/hooks/use-toast";

interface UseFileChangesOptions {
  successMessage?: string;
  /** Receives the ids of created, updated and moved files. */
  onSuccess?: (fileIds: string[]) => void;
  /** Called on HTTP 409 (a file changed since its `baseVersion`); defaults to a toast. */
  onConflict?: () => void;
}

interface FileChanges {
  /** Sends the batch; resolves to whether it was applied. Failures are already surfaced. */
  apply: (body: ApplyFileChangesBody) => Promise<boolean>;
  isPending: boolean;
  /** Refetches the file list plus the given files' content and history. */
  refresh: (fileIds: string[]) => void;
}

export const CONFLICT_MESSAGE =
  "This file changed since you opened it. Reload to get the latest version.";

/**
 * Atomic `/files/changes` batch. Only the touched files' cache entries change, so an open draft
 * of another file is never replaced underneath the user.
 */
export function useFileChanges(
  projectId: string,
  options: UseFileChangesOptions = {},
): FileChanges {
  const { successMessage, onSuccess, onConflict } = options;
  const toast = useToast();
  const queryClient = useQueryClient();

  const refresh = (fileIds: string[]) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.files.list(projectId) });
    for (const fileId of fileIds) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.files.content(projectId, fileId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.files.versions(projectId, fileId) });
    }
  };

  const mutation = useApiMutation(
    (body: ApplyFileChangesBody) => client.api.projects({ id: projectId }).files.changes.post(body),
    {
      invalidateKeys: [queryKeys.projects.stats()],
      successMessage,
      onSuccess: (data, body) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.files.list(projectId) });
        // Seed content from what was just sent instead of re-downloading (and re-auditing) it.
        for (const file of data.files) {
          const change = body.changes.find((c) =>
            c.fileId ? c.fileId === file.id : c.path === file.path,
          );
          const contentKey = queryKeys.files.content(projectId, file.id);
          if (change?.content) {
            const { encryptedContent, iv, authTag } = change.content;
            queryClient.setQueryData<RepoFileContentDto>(contentKey, {
              ...file,
              encryptedContent,
              iv,
              authTag,
            });
          } else {
            queryClient.setQueryData<RepoFileContentDto>(contentKey, (old) =>
              old ? { ...old, ...file } : old,
            );
          }
          void queryClient.invalidateQueries({
            queryKey: queryKeys.files.versions(projectId, file.id),
          });
        }
        const fileIds = data.files.map((f) => f.id);
        for (const fileId of data.deletedIds) {
          queryClient.removeQueries({ queryKey: queryKeys.files.content(projectId, fileId) });
          queryClient.removeQueries({ queryKey: queryKeys.files.versions(projectId, fileId) });
        }
        onSuccess?.(fileIds);
      },
      onError: (error) => {
        if (error.status === 409) {
          // The list is cheap and holds the versions needed for a retry; content stays as-is.
          refresh([]);
          if (onConflict) onConflict();
          else toast.error(CONFLICT_MESSAGE);
          return;
        }
        toast.error(error.message || "Failed to save changes");
      },
    },
  );

  const apply = async (body: ApplyFileChangesBody) => {
    try {
      await mutation.mutateAsync(body);
      return true;
    } catch {
      // Already surfaced by onError (toast, conflict banner or upgrade prompt).
      return false;
    }
  };

  return { apply, isPending: mutation.isPending, refresh };
}
