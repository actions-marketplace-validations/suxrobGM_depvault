"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { client } from "@/api/client";
import { useApiMutation, useApiQuery } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";

type LicensePolicy = "ALLOW" | "WARN" | "BLOCK";

interface ComplianceParams {
  page: number;
  pageSize: number;
  search: string;
}

interface CreateLicenseRule {
  licenseId: string;
  policy: LicensePolicy;
}

interface UpdateLicenseRule {
  ruleId: string;
  policy: LicensePolicy;
}

/** One page of dependency licenses with policy verdicts; keeps the last page while refetching. */
export function useLicenseCompliance(projectId: string, params: ComplianceParams) {
  const { page, pageSize, search } = params;
  return useApiQuery(
    queryKeys.licenses.compliance(projectId, params),
    () =>
      client.api.projects({ id: projectId })["license-rules"].compliance.get({
        query: { page, limit: pageSize, ...(search && { search }) },
      }),
    { placeholderData: keepPreviousData },
  );
}

/** Compliance totals only, for the project overview card. */
export function useLicenseComplianceOverview(projectId: string) {
  return useApiQuery(queryKeys.licenses.complianceOverview(projectId), () =>
    client.api.projects({ id: projectId })["license-rules"].compliance.get({
      query: { page: 1, limit: 1 },
    }),
  );
}

/** The project's per-license policy overrides. */
export function useLicenseRules(projectId: string) {
  return useApiQuery(queryKeys.licenses.rules(projectId), () =>
    client.api.projects({ id: projectId })["license-rules"].get(),
  );
}

/** Adds a policy override; verdicts change, so compliance refreshes along with the rules. */
export function useCreateLicenseRule(projectId: string) {
  return useApiMutation(
    (body: CreateLicenseRule) => client.api.projects({ id: projectId })["license-rules"].post(body),
    {
      invalidateKeys: [queryKeys.licenses.all(projectId)],
      successMessage: "License rule created",
    },
  );
}

/** Changes a rule's policy. */
export function useUpdateLicenseRule(projectId: string) {
  return useApiMutation(
    ({ ruleId, policy }: UpdateLicenseRule) =>
      client.api.projects({ id: projectId })["license-rules"]({ ruleId }).put({ policy }),
    {
      invalidateKeys: [queryKeys.licenses.all(projectId)],
      successMessage: "License rule updated",
    },
  );
}

/** Removes a rule so the default policy applies again. */
export function useDeleteLicenseRule(projectId: string) {
  return useApiMutation(
    (ruleId: string) =>
      client.api.projects({ id: projectId })["license-rules"]({ ruleId }).delete(),
    {
      invalidateKeys: [queryKeys.licenses.all(projectId)],
      successMessage: "License rule deleted",
    },
  );
}
