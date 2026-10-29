import { Elysia } from "elysia";
import { container } from "@/common/di/container";
import { authGuard } from "@/common/middleware";
import { MINUTE_MS, rateLimiter } from "@/common/middleware/rate-limiter";
import { StringIdParamSchema } from "@/types/request";
import { MessageResponseSchema } from "@/types/response";
import {
  CreateShareBodySchema,
  CreateShareResponseSchema,
  ShareLinkListResponseSchema,
  ShareLinkParamsSchema,
} from "./share-link.schema";
import { ShareLinkService } from "./share-link.service";

const shareLinkService = container.get(ShareLinkService);

export const shareLinkController = new Elysia({
  prefix: "/projects/:id/shares",
  detail: { tags: ["Share Links"], security: [{ bearerAuth: [] }] },
})
  .use(authGuard)
  .use(rateLimiter)
  .post(
    "/",
    ({ params, body, projectMember, clientIp }) =>
      shareLinkService.create(params.id, projectMember.userId, body, clientIp),
    {
      params: StringIdParamSchema,
      body: CreateShareBodySchema,
      response: CreateShareResponseSchema,
      projectRole: "EDITOR",
      rateLimit: { max: 30, windowMs: MINUTE_MS },
      detail: {
        operationId: "createShareLink",
        summary: "Create a share link for a file",
        description:
          "Generate a one-time shareable link for a client-encrypted file. Optional password and expiry supported.",
      },
    },
  )
  .get("/", ({ params }) => shareLinkService.list(params.id), {
    params: StringIdParamSchema,
    response: ShareLinkListResponseSchema,
    projectRole: "EDITOR",
    rateLimit: { max: 30, windowMs: MINUTE_MS },
    detail: {
      operationId: "listShareLinks",
      summary: "List share links",
      description:
        "List all share links created for this project with their status (PENDING, VIEWED, EXPIRED).",
    },
  })
  .delete(
    "/:shareId",
    ({ params, projectMember, clientIp }) =>
      shareLinkService.revoke(params.id, params.shareId, projectMember.userId, clientIp),
    {
      params: ShareLinkParamsSchema,
      response: MessageResponseSchema,
      projectRole: "EDITOR",
      rateLimit: { max: 30, windowMs: MINUTE_MS },
      detail: {
        operationId: "revokeShareLink",
        summary: "Revoke a pending share link",
        description:
          "Permanently delete a pending share link. Already-viewed links cannot be revoked.",
      },
    },
  );
