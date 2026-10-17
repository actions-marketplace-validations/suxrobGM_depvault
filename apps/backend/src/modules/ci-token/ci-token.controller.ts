import { Elysia } from "elysia";
import { container } from "@/common/di/container";
import { authGuard } from "@/common/middleware";
import { rateLimiter } from "@/common/middleware/rate-limiter";
import { getClientIp } from "@/common/utils/ip";
import { StringIdParamSchema } from "@/types/request";
import { MessageResponseSchema } from "@/types/response";
import { ciTokenGuard } from "./ci-token.middleware";
import {
  CiFilesResponseSchema,
  CiTokenCreatedResponseSchema,
  CiTokenListQuerySchema,
  CiTokenListResponseSchema,
  CiTokenParamsSchema,
  CreateCiTokenBodySchema,
} from "./ci-token.schema";
import { CiTokenService } from "./ci-token.service";

const ciTokenService = container.resolve(CiTokenService);

/** Management endpoints for CI/CD tokens (JWT-authenticated); writes are throttled per IP. */
export const ciTokenController = new Elysia({
  prefix: "/projects/:id/ci-tokens",
  detail: { tags: ["CI/CD Tokens"], security: [{ bearerAuth: [] }] },
})
  .use(authGuard)
  .get("/", ({ params, query }) => ciTokenService.list(params.id, query.page, query.limit), {
    params: StringIdParamSchema,
    query: CiTokenListQuerySchema,
    response: CiTokenListResponseSchema,
    projectRole: "VIEWER",
    detail: {
      operationId: "listCiTokens",
      summary: "List CI tokens",
      description: "List all CI/CD tokens for a project.",
    },
  })
  .use(rateLimiter({ max: 20, windowMs: 60 * 1000 }))
  .post(
    "/",
    ({ params, body, projectMember, request, server }) =>
      ciTokenService.create(params.id, projectMember.userId, body, getClientIp(request, server)),
    {
      params: StringIdParamSchema,
      body: CreateCiTokenBodySchema,
      response: CiTokenCreatedResponseSchema,
      projectRole: "EDITOR",
      detail: {
        operationId: "createCiToken",
        summary: "Create CI token",
        description:
          "Register a client-generated CI/CD token, optionally limited to files matching path globs.",
      },
    },
  )
  .delete(
    "/:tokenId",
    ({ params, projectMember, request, server }) =>
      ciTokenService.revoke(
        params.id,
        params.tokenId,
        projectMember.userId,
        getClientIp(request, server),
      ),
    {
      params: CiTokenParamsSchema,
      response: MessageResponseSchema,
      projectRole: "EDITOR",
      detail: {
        operationId: "revokeCiToken",
        summary: "Revoke CI token",
        description: "Immediately revoke a CI/CD token.",
      },
    },
  );

/** CI/CD access endpoint (CI token authenticated), throttled per IP to slow token guessing. */
export const ciAccessController = new Elysia({
  prefix: "/ci/files",
  detail: { tags: ["CI/CD Access"], security: [{ bearerAuth: [] }] },
})
  .use(rateLimiter({ max: 60, windowMs: 60 * 1000 }))
  .use(ciTokenGuard)
  .get(
    "/",
    ({ ciToken, clientIp, headers }) =>
      ciTokenService.fetchFiles(ciToken, headers["x-pipeline-run-id"] ?? null, clientIp),
    {
      response: CiFilesResponseSchema,
      detail: {
        operationId: "fetchCiFiles",
        summary: "Fetch files",
        description:
          "Return the token-wrapped DEK and the ciphertext of every file the token may read, in one call. Decryption happens in the pipeline.",
      },
    },
  );
