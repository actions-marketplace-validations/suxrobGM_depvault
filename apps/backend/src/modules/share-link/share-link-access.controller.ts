import { Elysia } from "elysia";
import { container } from "@/common/di/container";
import { withClientIp } from "@/common/middleware/client-ip.middleware";
import { rateLimiter } from "@/common/middleware/rate-limiter";
import { GoneErrorSchema, TooManyRequestsErrorSchema } from "@/types/response";
import {
  AccessShareBodySchema,
  AccessShareResponseSchema,
  ShareLinkInfoResponseSchema,
  TokenParamSchema,
} from "./share-link.schema";
import { ShareLinkService } from "./share-link.service";

const shareLinkService = container.resolve(ShareLinkService);

export const shareLinkAccessController = new Elysia({
  prefix: "/shares",
  detail: { tags: ["Share Links"] },
})
  .use(withClientIp)
  .use(rateLimiter({ max: 60, windowMs: 60 * 1000 }))
  .get("/:token/info", ({ params }) => shareLinkService.getInfo(params.token), {
    params: TokenParamSchema,
    response: {
      200: ShareLinkInfoResponseSchema,
      ...GoneErrorSchema,
      ...TooManyRequestsErrorSchema,
    },
    detail: {
      operationId: "getShareLinkInfo",
      summary: "Check share link info",
      description:
        "Returns metadata (file name, password-protected, expiry) without consuming the share link.",
    },
  })
  .post(
    "/:token",
    ({ params, body, clientIp }) => shareLinkService.access(params.token, body.password, clientIp),
    {
      params: TokenParamSchema,
      body: AccessShareBodySchema,
      response: {
        200: AccessShareResponseSchema,
        ...GoneErrorSchema,
        ...TooManyRequestsErrorSchema,
      },
      detail: {
        operationId: "accessShareLink",
        summary: "Access a one-time share link",
        description:
          "Retrieve and permanently consume a share link. Content is destroyed after this call, so no second access is possible.",
      },
    },
  );
