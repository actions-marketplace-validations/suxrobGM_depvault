"use client";

import { PROJECT_ROLE_LEVEL, type ProjectRole } from "@depvault/shared/constants";
import { client } from "@/api/client";
import { useApiQuery } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";
import type { ProjectDetailDto } from "@/api/types/project";

/** Whether the current user is an editor or owner, from the project's own `currentUserRole`. */
export function useCanEditProject(projectId: string): boolean {
  const { data: project } = useApiQuery<ProjectDetailDto>(
    queryKeys.projects.detail(projectId),
    () => client.api.projects({ id: projectId }).get(),
  );

  const role = project?.currentUserRole as ProjectRole | undefined;
  return role !== undefined && PROJECT_ROLE_LEVEL[role] >= PROJECT_ROLE_LEVEL.EDITOR;
}
