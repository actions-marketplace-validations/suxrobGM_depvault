"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { client } from "@/api/client";
import { type MutationCallbacks, useApiMutation, useApiQuery } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";
import type { BatchUpdateDetectionsBody, DetectionDto, PatternDto } from "@/api/types/secret-scan";

type DetectionStatus = DetectionDto["status"];
type PatternSeverity = PatternDto["severity"];
type TriageStatus = BatchUpdateDetectionsBody["status"];

interface PageParams {
  page: number;
  pageSize: number;
}

interface DetectionParams extends PageParams {
  status: DetectionStatus | "";
  severity: PatternSeverity | "";
}

interface UpdateDetection {
  detectionId: string;
  status: TriageStatus;
}

interface PatternValues {
  name: string;
  regex: string;
  severity: PatternSeverity;
}

interface UpdatePattern extends PatternValues {
  patternId: string;
}

/** What triaging detections changes; patterns and scan history stay as they are. */
const triageDependents = (projectId: string) => [
  queryKeys.scanning.detections(projectId),
  queryKeys.scanning.summary(projectId),
  queryKeys.security.overview(),
];

/** Last scan plus open/resolved detection counts. */
export function useScanSummary(projectId: string) {
  return useApiQuery(
    queryKeys.scanning.summary(projectId),
    () => client.api.projects({ id: projectId })["scan-summary"].get(),
    { errorMessage: "Failed to load scan summary" },
  );
}

/** One page of scan runs. */
export function useScans(projectId: string, params: PageParams) {
  const { page, pageSize } = params;
  return useApiQuery(
    queryKeys.scanning.scansList(projectId, params),
    () => client.api.projects({ id: projectId }).scans.get({ query: { page, limit: pageSize } }),
    { errorMessage: "Failed to load scan history", placeholderData: keepPreviousData },
  );
}

/** One page of detections, optionally filtered by status and severity. */
export function useDetections(projectId: string, params: DetectionParams) {
  const { page, pageSize, status, severity } = params;
  return useApiQuery(
    queryKeys.scanning.detectionsList(projectId, params),
    () =>
      client.api.projects({ id: projectId }).detections.get({
        query: {
          page,
          limit: pageSize,
          ...(status && { status }),
          ...(severity && { severity }),
        },
      }),
    { errorMessage: "Failed to load detections", placeholderData: keepPreviousData },
  );
}

/** Built-in and custom scan patterns. */
export function useScanPatterns(projectId: string) {
  return useApiQuery(
    queryKeys.scanning.patterns(projectId),
    () => client.api.projects({ id: projectId })["scan-patterns"].get(),
    { errorMessage: "Failed to load patterns" },
  );
}

/** Starts a scan of the project's repository. */
export function useTriggerScan(projectId: string) {
  return useApiMutation(() => client.api.projects({ id: projectId }).scans.post(), {
    invalidateKeys: [queryKeys.scanning.all(projectId), queryKeys.security.overview()],
    successMessage: "Scan started successfully",
    errorMessage: "Failed to start scan",
  });
}

/** Triages one detection. */
export function useUpdateDetection(projectId: string) {
  return useApiMutation(
    ({ detectionId, status }: UpdateDetection) =>
      client.api.projects({ id: projectId }).detections({ detectionId }).patch({ status }),
    {
      invalidateKeys: triageDependents(projectId),
      successMessage: "Detection updated",
    },
  );
}

/** Triages several detections at once. */
export function useBatchUpdateDetections(projectId: string, options: MutationCallbacks = {}) {
  return useApiMutation(
    (body: BatchUpdateDetectionsBody) =>
      client.api.projects({ id: projectId }).detections.patch(body),
    {
      invalidateKeys: triageDependents(projectId),
      successMessage: "Detections updated",
      onSuccess: options.onSuccess,
    },
  );
}

/** Adds a custom pattern. */
export function useCreatePattern(projectId: string, options: MutationCallbacks = {}) {
  return useApiMutation(
    (values: PatternValues) => client.api.projects({ id: projectId })["scan-patterns"].post(values),
    {
      invalidateKeys: [queryKeys.scanning.patterns(projectId)],
      successMessage: "Pattern created",
      onSuccess: options.onSuccess,
    },
  );
}

/** Edits a custom pattern. */
export function useUpdatePattern(projectId: string, options: MutationCallbacks = {}) {
  return useApiMutation(
    ({ patternId, ...values }: UpdatePattern) =>
      client.api.projects({ id: projectId })["scan-patterns"]({ patternId }).put(values),
    {
      invalidateKeys: [queryKeys.scanning.patterns(projectId)],
      successMessage: "Pattern updated",
      onSuccess: options.onSuccess,
    },
  );
}

/** Deletes a custom pattern. */
export function useDeletePattern(projectId: string) {
  return useApiMutation(
    (patternId: string) =>
      client.api.projects({ id: projectId })["scan-patterns"]({ patternId }).delete(),
    {
      invalidateKeys: [queryKeys.scanning.patterns(projectId)],
      successMessage: "Pattern deleted",
    },
  );
}
