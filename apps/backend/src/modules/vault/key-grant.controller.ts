import { Elysia, t } from "elysia";
import { container } from "@/common/di/container";
import { projectGuard } from "@/common/middleware/project.middleware";
import { KeyGrantService } from "./key-grant.service";
import {
  KeyGrantResponseSchema,
  MessageResponseSchema,
  PendingGrantMemberSchema,
  ShareKeyGrantBodySchema,
  StoreOwnGrantsBodySchema,
} from "./vault.schema";

const keyGrantService = container.resolve(KeyGrantService);

const detail = { tags: ["Key Grants"], security: [{ bearerAuth: [] }] };

/** The caller's own grants (any member). */
const ownKeyGrantController = new Elysia({ prefix: "/projects/:id/keygrants", detail })
  .use(projectGuard("VIEWER"))
  .get(
    "/my",
    ({ user, projectMember }) => keyGrantService.getForUser(projectMember.projectId, user.id),
    {
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
      body: StoreOwnGrantsBodySchema,
      response: MessageResponseSchema,
      detail: {
        operationId: "storeMyKeyGrants",
        summary: "Store my key grants",
        description:
          "Atomically store the caller's SELF and RECOVERY grants: a project's first key, or adopting a shared key. Refused (409) when introducing a new key while others hold one.",
      },
    },
  );

/** Distributing the key to other members (EDITOR+). */
const shareKeyGrantController = new Elysia({ prefix: "/projects/:id/keygrants", detail })
  .use(projectGuard("EDITOR"))
  .get(
    "/pending",
    ({ projectMember }) => keyGrantService.getPendingMembers(projectMember.projectId),
    {
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

export const keyGrantController = new Elysia()
  .use(ownKeyGrantController)
  .use(shareKeyGrantController);
