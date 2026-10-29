"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { client } from "@/api/client";
import { type MutationCallbacks, useApiMutation, useApiQuery } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";
import type { CreateAnalysisBody } from "@/api/types/analysis";
import type { GitHubDependencyFileDto } from "@/api/types/github";

interface GitHubRepoRef {
  owner: string;
  repo: string;
}

interface GitHubImport extends GitHubRepoRef {
  files: GitHubDependencyFileDto[];
}

interface GitHubImportResult {
  created: number;
  /** Paths that could not be fetched or analyzed. */
  failed: string[];
}

interface UpdateAnalysisPath {
  filePath: string | null;
}

/** Everything derived from a project's analyses: the analyses, license compliance and counters. */
const analysisDependents = (projectId: string) => [
  queryKeys.analyses.all(projectId),
  queryKeys.licenses.complianceAll(projectId),
  queryKeys.security.overview(),
  queryKeys.projects.stats(),
];

/** One page of a project's analyses; the previous page stays visible while the next loads. */
export function useAnalyses(projectId: string, page: number, pageSize: number) {
  return useApiQuery(
    queryKeys.analyses.list(projectId, { page, pageSize }),
    () => client.api.projects({ id: projectId }).analyses.get({ query: { page, limit: pageSize } }),
    { placeholderData: keepPreviousData },
  );
}

/** Up to 100 analyses for the project overview's aggregate stats. */
export function useAnalysesOverview(projectId: string) {
  return useApiQuery(queryKeys.analyses.overview(projectId), () =>
    client.api.projects({ id: projectId }).analyses.get({ query: { page: 1, limit: 100 } }),
  );
}

/** One analysis with its dependencies and vulnerabilities. */
export function useAnalysis(projectId: string, analysisId: string) {
  return useApiQuery(queryKeys.analyses.detail(projectId, analysisId), () =>
    client.api.projects({ id: projectId }).analyses({ analysisId }).get(),
  );
}

/** Analyzes an uploaded dependency file. */
export function useCreateAnalysis(projectId: string, options: MutationCallbacks = {}) {
  return useApiMutation(
    (values: CreateAnalysisBody) => client.api.projects({ id: projectId }).analyses.post(values),
    {
      invalidateKeys: analysisDependents(projectId),
      successMessage: "Analysis created successfully",
      onSuccess: options.onSuccess,
    },
  );
}

/** Deletes an analysis and its dependency data. */
export function useDeleteAnalysis(projectId: string, options: MutationCallbacks = {}) {
  return useApiMutation(
    (analysisId: string) =>
      client.api.projects({ id: projectId }).analyses({ analysisId }).delete(),
    {
      invalidateKeys: analysisDependents(projectId),
      successMessage: "Analysis deleted",
      onSuccess: options.onSuccess,
    },
  );
}

/** Renames the monorepo path an analysis is shown under. */
export function useUpdateAnalysisPath(
  projectId: string,
  analysisId: string,
  options: MutationCallbacks = {},
) {
  return useApiMutation(
    (body: UpdateAnalysisPath) =>
      client.api.projects({ id: projectId }).analyses({ analysisId }).patch(body),
    {
      invalidateKeys: [queryKeys.analyses.all(projectId), queryKeys.licenses.all(projectId)],
      successMessage: "File path updated",
      onSuccess: options.onSuccess,
    },
  );
}

/** Re-resolves an analysis's dependencies against the latest vulnerability data. */
export function useRescanAnalysis(projectId: string, analysisId: string) {
  return useApiMutation(
    () => client.api.projects({ id: projectId }).analyses({ analysisId }).rescan.post(),
    {
      invalidateKeys: analysisDependents(projectId),
      successMessage: "Rescan completed",
    },
  );
}

/** Files fetched and analyzed at once: enough to overlap round trips without flooding GitHub. */
const IMPORT_CONCURRENCY = 3;

/**
 * Fetches each selected GitHub file and analyzes it, as one mutation so a failure surfaces once.
 * Fails only when nothing was created; partial failures come back in `failed`.
 */
export function useImportGitHubAnalyses(
  projectId: string,
  options: MutationCallbacks<GitHubImportResult> = {},
) {
  return useApiMutation(
    async ({ owner, repo, files }: GitHubImport) => {
      const repoApi = client.api.github.repos({ owner })({ repo });

      const importFile = async (file: GitHubDependencyFileDto): Promise<unknown> => {
        const content = await repoApi.content.get({ query: { path: file.path } });
        if (!content.data) return content.error;
        const created = await client.api.projects({ id: projectId }).analyses.post({
          fileName: file.name,
          filePath: file.path,
          content: content.data.content,
          ecosystem: file.ecosystem as CreateAnalysisBody["ecosystem"],
        });
        return created.error;
      };

      const errors: unknown[] = new Array(files.length).fill(null);
      let next = 0;
      const worker = async () => {
        while (next < files.length) {
          const index = next++;
          errors[index] = await importFile(files[index]!);
        }
      };
      await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, files.length) }, worker));

      const failed = files.filter((_, i) => errors[i]).map((file) => file.path);
      const result: GitHubImportResult = { created: files.length - failed.length, failed };
      return result.created > 0
        ? { data: result, error: null }
        : { data: null, error: errors.find(Boolean) ?? null };
    },
    {
      invalidateKeys: analysisDependents(projectId),
      successMessage: ({ created }) =>
        `${created} ${created === 1 ? "analysis" : "analyses"} created`,
      onSuccess: options.onSuccess,
    },
  );
}

/** The linked GitHub account's repositories. */
export function useGitHubRepos(enabled: boolean) {
  return useApiQuery(
    queryKeys.github.repos(),
    () => client.api.github.repos.get({ query: { page: 1, limit: 100 } }),
    { enabled },
  );
}

/** Dependency manifests found in a GitHub repository. */
export function useGitHubDependencyFiles(selected: GitHubRepoRef | null, enabled: boolean) {
  return useApiQuery(
    queryKeys.github.dependencyFiles(selected?.owner ?? null, selected?.repo ?? null),
    () =>
      client.api.github
        .repos({ owner: selected?.owner ?? "" })({ repo: selected?.repo ?? "" })
        ["dependency-files"].get(),
    { enabled: enabled && selected !== null },
  );
}
