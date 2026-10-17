import type { QueryClient } from "@tanstack/react-query";
import { client } from "@/api/client";
import { queryKeys } from "@/api/query-keys";
import type { RepoFileVersionContentDto } from "@/api/types/repo-file";

/** Fetches one version's ciphertext; versions are immutable, so the result is cached forever. */
export function fetchVersion(
  queryClient: QueryClient,
  projectId: string,
  fileId: string,
  version: number,
): Promise<RepoFileVersionContentDto> {
  return queryClient.fetchQuery({
    queryKey: queryKeys.files.versionContent(projectId, fileId, version),
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const { data, error } = await client.api
        .projects({ id: projectId })
        .files({ fileId })
        .versions({ version })
        .get();
      if (error || !data) throw new Error(`Failed to load version ${version}`);
      return data;
    },
  });
}
