"use client";

import { PROJECT_ROLE_LEVEL, type ProjectRole } from "@depvault/shared/constants";
import { client } from "@/api/client";
import { useApiMutation, useApiQuery } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";
import type { CreateProjectBody, UpdateProjectBody } from "@/api/types/project";
import { PAGINATION_DEFAULTS } from "@/lib/constants";

interface ProjectRoleInfo {
  role: ProjectRole | undefined;
  /** Editor or owner. */
  canEdit: boolean;
  isOwner: boolean;
  isLoading: boolean;
}

interface MutationCallbacks<TData = unknown> {
  onSuccess?: (data: TData) => void;
}

/** The current user's projects (first page). */
export function useProjects() {
  return useApiQuery(queryKeys.projects.list(), () =>
    client.api.projects.get({ query: { page: 1, limit: PAGINATION_DEFAULTS.limit } }),
  );
}

/** Cross-project counters for the dashboard home. */
export function useProjectStats() {
  return useApiQuery(queryKeys.projects.stats(), () => client.api.projects.stats.get());
}

/** A project's details, including the current user's role in it. */
export function useProject(projectId: string) {
  return useApiQuery(queryKeys.projects.detail(projectId), () =>
    client.api.projects({ id: projectId }).get(),
  );
}

/** The current user's role in a project, from the project's own `currentUserRole`. */
export function useProjectRole(projectId: string): ProjectRoleInfo {
  const { data: project, isLoading } = useProject(projectId);
  const role = project?.currentUserRole as ProjectRole | undefined;
  const level = role ? PROJECT_ROLE_LEVEL[role] : -1;

  return {
    role,
    canEdit: level >= PROJECT_ROLE_LEVEL.EDITOR,
    isOwner: role === "OWNER",
    isLoading,
  };
}

/** Creates a project; the caller sets up its encryption key in `onSuccess`. */
export function useCreateProject(options: MutationCallbacks<{ id: string }> = {}) {
  return useApiMutation((values: CreateProjectBody) => client.api.projects.post(values), {
    invalidateKeys: [queryKeys.projects.list(), queryKeys.projects.stats()],
    successMessage: "Project created",
    errorMessage: "Failed to create project",
    onSuccess: (data) => options.onSuccess?.(data),
  });
}

/** Updates a project's name, description or repository URL. */
export function useUpdateProject(projectId: string) {
  return useApiMutation(
    (values: UpdateProjectBody) => client.api.projects({ id: projectId }).put(values),
    {
      invalidateKeys: [queryKeys.projects.detail(projectId), queryKeys.projects.list()],
      successMessage: "Project updated",
    },
  );
}

/** Deletes a project and everything in it. */
export function useDeleteProject(projectId: string, options: MutationCallbacks = {}) {
  return useApiMutation(() => client.api.projects({ id: projectId }).delete(), {
    invalidateKeys: [queryKeys.projects.list(), queryKeys.projects.stats()],
    successMessage: "Project deleted",
    onSuccess: (data) => options.onSuccess?.(data),
  });
}

/** Hands ownership to another member; every role-dependent view of the project changes. */
export function useTransferOwnership(projectId: string, options: MutationCallbacks = {}) {
  return useApiMutation(
    (vars: { newOwnerId: string }) => client.api.projects({ id: projectId }).transfer.post(vars),
    {
      invalidateKeys: [queryKeys.projects.scope(projectId), queryKeys.projects.list()],
      successMessage: "Ownership transferred",
      onSuccess: (data) => options.onSuccess?.(data),
    },
  );
}

/** Invitations waiting for the current user's answer. */
export function usePendingInvitations() {
  return useApiQuery(queryKeys.invitations.pending(), () =>
    client.api.invitations.pending.get({ query: { page: 1, limit: 50 } }),
  );
}

/** Accepts an invitation; the project then shows up in the user's list. */
export function useAcceptInvitation(token: string, options: MutationCallbacks = {}) {
  return useApiMutation(() => client.api.invitations({ token }).accept.post(), {
    invalidateKeys: [
      queryKeys.invitations.pending(),
      queryKeys.projects.list(),
      queryKeys.projects.stats(),
    ],
    successMessage: "Invitation accepted",
    onSuccess: (data) => options.onSuccess?.(data),
  });
}

/** Declines an invitation. */
export function useDeclineInvitation(token: string, options: MutationCallbacks = {}) {
  return useApiMutation(() => client.api.invitations({ token }).decline.post(), {
    invalidateKeys: [queryKeys.invitations.pending()],
    successMessage: "Invitation declined",
    onSuccess: (data) => options.onSuccess?.(data),
  });
}
