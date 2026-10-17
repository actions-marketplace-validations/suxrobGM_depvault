"use client";

import { client } from "@/api/client";
import { useApiMutation, useApiQuery } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";

type AssignableRole = "EDITOR" | "VIEWER";

interface InviteMemberValues {
  email: string;
  role: AssignableRole;
}

interface InvitationsOptions {
  enabled?: boolean;
}

interface InviteMemberOptions {
  onSuccess?: () => void;
}

/** The API's page-size cap; members and invitations are loaded as a single page. */
const MEMBERS_LIMIT = 100;

/** A project's members with their roles. */
export function useProjectMembers(projectId: string) {
  return useApiQuery(queryKeys.projects.members(projectId), () =>
    client.api
      .projects({ id: projectId })
      .members.get({ query: { page: 1, limit: MEMBERS_LIMIT } }),
  );
}

/** A project's pending invitations; only owners can act on them, so others can skip the fetch. */
export function useProjectInvitations(projectId: string, options: InvitationsOptions = {}) {
  return useApiQuery(
    queryKeys.projects.invitations(projectId),
    () =>
      client.api
        .projects({ id: projectId })
        .invitations.get({ query: { page: 1, limit: MEMBERS_LIMIT } }),
    { enabled: options.enabled },
  );
}

/** Invites someone by email with a role. */
export function useInviteMember(projectId: string, options: InviteMemberOptions = {}) {
  return useApiMutation(
    (values: InviteMemberValues) => client.api.projects({ id: projectId }).members.post(values),
    {
      invalidateKeys: [
        queryKeys.projects.members(projectId),
        queryKeys.projects.invitations(projectId),
      ],
      successMessage: "Invitation sent",
      onSuccess: () => options.onSuccess?.(),
    },
  );
}

/** Changes a member's role. */
export function useUpdateMemberRole(projectId: string) {
  return useApiMutation(
    (vars: { memberId: string; role: AssignableRole }) =>
      client.api
        .projects({ id: projectId })
        .members({ memberId: vars.memberId })
        .put({ role: vars.role }),
    {
      invalidateKeys: [queryKeys.projects.members(projectId)],
      successMessage: "Role updated",
    },
  );
}

/** Removes a member from the project. */
export function useRemoveMember(projectId: string) {
  return useApiMutation(
    (memberId: string) => client.api.projects({ id: projectId }).members({ memberId }).delete(),
    {
      invalidateKeys: [
        queryKeys.projects.members(projectId),
        queryKeys.projects.pendingKeyGrants(projectId),
      ],
      successMessage: "Member removed",
    },
  );
}

/** Re-sends an invitation email. */
export function useResendInvitation(projectId: string) {
  return useApiMutation(
    (invitationId: string) =>
      client.api.projects({ id: projectId }).invitations({ invitationId }).resend.post(),
    {
      invalidateKeys: [queryKeys.projects.invitations(projectId)],
      successMessage: "Invitation resent",
    },
  );
}

/** Withdraws a pending invitation. */
export function useCancelInvitation(projectId: string) {
  return useApiMutation(
    (invitationId: string) =>
      client.api.projects({ id: projectId }).invitations({ invitationId }).delete(),
    {
      invalidateKeys: [queryKeys.projects.invitations(projectId)],
      successMessage: "Invitation cancelled",
    },
  );
}
