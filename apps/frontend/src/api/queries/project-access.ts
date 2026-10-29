"use client";

import { client } from "@/api/client";
import { useApiMutation, useApiQuery } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";
import type { CreateCiTokenBody } from "@/api/types/ci-token";
import type { CreateShareBody } from "@/api/types/share-link";

/** The API's page-size cap; a project's CI tokens are loaded as a single page. */
const CI_TOKENS_LIMIT = 100;

/** A project's CI/CD tokens (metadata only; the secret part is never stored). */
export function useCiTokens(projectId: string) {
  return useApiQuery(
    queryKeys.ciTokens.byProject(projectId),
    () =>
      client.api
        .projects({ id: projectId })
        ["ci-tokens"].get({ query: { page: 1, limit: CI_TOKENS_LIMIT } }),
    { errorMessage: "Failed to load CI tokens" },
  );
}

/** Revokes a CI token; pipelines using it lose access immediately. */
export function useRevokeCiToken(projectId: string) {
  return useApiMutation(
    (tokenId: string) => client.api.projects({ id: projectId })["ci-tokens"]({ tokenId }).delete(),
    {
      invalidateKeys: [queryKeys.ciTokens.byProject(projectId)],
      successMessage: "CI token revoked",
      errorMessage: "Failed to revoke token",
    },
  );
}

/** One-time share links created in the project. */
export function useShareLinks(projectId: string) {
  return useApiQuery(
    queryKeys.shareLinks.byProject(projectId),
    () => client.api.projects({ id: projectId }).shares.get(),
    { errorMessage: "Failed to load share links" },
  );
}

/** Revokes a pending share link. */
export function useRevokeShareLink(projectId: string) {
  return useApiMutation(
    (shareId: string) => client.api.projects({ id: projectId }).shares({ shareId }).delete(),
    {
      invalidateKeys: [queryKeys.shareLinks.byProject(projectId)],
      successMessage: "Share link revoked",
      errorMessage: "Failed to revoke share link",
    },
  );
}

/** Registers a client-generated CI token (bearer hash + wrapped DEK). */
export function useCreateCiToken(projectId: string) {
  return useApiMutation(
    (body: CreateCiTokenBody) => client.api.projects({ id: projectId })["ci-tokens"].post(body),
    {
      invalidateKeys: [queryKeys.ciTokens.byProject(projectId)],
      errorMessage: (error) => error.message || "Failed to create CI token",
    },
  );
}

/** Stores a one-time share of a file encrypted under an ephemeral key. */
export function useCreateShareLink(projectId: string) {
  return useApiMutation(
    (body: CreateShareBody) => client.api.projects({ id: projectId }).shares.post(body),
    {
      invalidateKeys: [queryKeys.shareLinks.byProject(projectId)],
      errorMessage: "Failed to create share link",
    },
  );
}
