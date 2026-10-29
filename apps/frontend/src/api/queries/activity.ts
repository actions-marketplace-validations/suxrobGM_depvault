"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { client } from "@/api/client";
import { useApiQuery } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";
import type { AuditAction, AuditResourceType } from "@/api/types/audit-log";

interface ActivityParams {
  page: number;
  pageSize: number;
  action: AuditAction | "";
  resourceType: AuditResourceType | "";
  /** `YYYY-MM-DD`, inclusive. */
  from: string;
  /** `YYYY-MM-DD`, inclusive. */
  to: string;
}

interface AuditLogParams extends ActivityParams {
  userEmail: string;
}

/** Shared query string for both activity endpoints; dates cover whole local days. */
const activityQuery = (params: ActivityParams) => ({
  page: params.page,
  limit: params.pageSize,
  ...(params.action && { action: params.action }),
  ...(params.resourceType && { resourceType: params.resourceType }),
  ...(params.from && { from: new Date(params.from).toISOString() }),
  ...(params.to && { to: new Date(`${params.to}T23:59:59.999`).toISOString() }),
});

/** One page of a project's audit log. */
export function useAuditLog(projectId: string, params: AuditLogParams) {
  return useApiQuery(
    queryKeys.auditLog.list(projectId, params),
    () =>
      client.api.projects({ id: projectId })["audit-log"].get({
        query: {
          ...activityQuery(params),
          ...(params.userEmail && { userEmail: params.userEmail }),
        },
      }),
    { errorMessage: "Failed to load activity log", placeholderData: keepPreviousData },
  );
}

/** One page of activity across all of the user's projects. */
export function useGlobalActivity(params: ActivityParams) {
  return useApiQuery(
    queryKeys.globalActivity.list(params),
    () => client.api.activity.get({ query: activityQuery(params) }),
    { errorMessage: "Failed to load activity", placeholderData: keepPreviousData },
  );
}
