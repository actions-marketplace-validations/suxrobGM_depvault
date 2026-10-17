import { Elysia, t } from "elysia";
import { container } from "@/common/di/container";
import { authGuard } from "@/common/middleware";
import { MessageResponseSchema } from "@/types/response";
import { KeyGrantService } from "./key-grant.service";
import {
  KeyGrantResponseSchema,
  PendingGrantMemberSchema,
  ShareKeyGrantBodySchema,
  StoreOwnGrantsBodySchema,
} from "./vault.schema";

const keyGrantService = container.resolve(KeyGrantService);

/** Project key grants: any member manages their own; sharing with others needs EDITOR+. */
export const keyGrantController = new Elysia({
  prefix: "/projects/:id/keygrants",
  detail: { tags: ["Key Grants"], security: [{ bearerAuth: [] }] },
})
  .use(authGuard)
  .get(
    "/my",
    ({ user, projectMember }) => keyGrantService.getForUser(projectMember.projectId, user.id),
    {
      projectRole: "VIEWER",
      response: KeyGrantResponseSchema,
      detail: {
        operationId: "getMyKeyGrant",
        summary: "Get my key grant",
        description: "Get the current user's wrapped DEK for this project (SELF, else ECDH).",
      },
    },
  )
  .put(
    "/my",
    ({ user, projectMember, body }) =>
      keyGrantService.storeOwn(projectMember.projectId, user.id, body),
    {
      projectRole: "VIEWER",
      body: StoreOwnGrantsBodySchema,
      response: MessageResponseSchema,
      detail: {
        operationId: "storeMyKeyGrants",
        summary: "Store my key grants",
        description:
          "Atomically store the caller's SELF and RECOVERY grants: a project's first key, or adopting a shared key. Refused (409) when introducing a new key while others hold one.",
      },
    },
  )
  .get(
    "/pending",
    ({ projectMember }) => keyGrantService.getPendingMembers(projectMember.projectId),
    {
      projectRole: "EDITOR",
      response: t.Array(PendingGrantMemberSchema),
      detail: {
        operationId: "getPendingKeyGrants",
        summary: "List members needing key grants",
        description: "List project members who can't open the project key yet.",
      },
    },
  )
  .post(
    "/",
    ({ user, projectMember, body }) =>
      keyGrantService.shareWithMember(projectMember.projectId, user.id, body),
    {
      projectRole: "EDITOR",
      body: ShareKeyGrantBodySchema,
      response: MessageResponseSchema,
      detail: {
        operationId: "shareKeyGrant",
        summary: "Share project key",
        description:
          "Give a member the project key wrapped under an ECDH secret with the caller's keypair.",
      },
    },
  );
