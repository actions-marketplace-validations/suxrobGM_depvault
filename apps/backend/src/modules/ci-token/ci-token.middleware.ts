import { Elysia } from "elysia";
import { container } from "@/common/di/container";
import { UnauthorizedError } from "@/common/errors/http.error";
import { bearerToken } from "@/common/middleware/auth.middleware";
import { withClientIp } from "@/common/middleware/client-ip.middleware";
import { CiTokenService } from "./ci-token.service";

/** Validates a CI token from the Authorization header and injects context. */
export const ciTokenGuard = new Elysia({ name: "ci-token-guard" })
  .use(withClientIp)
  .derive({ as: "scoped" }, async ({ headers, clientIp }) => {
    const rawToken = bearerToken(headers.authorization);

    if (!rawToken) {
      throw new UnauthorizedError("Missing CI token");
    }

    const ciTokenService = container.resolve(CiTokenService);
    const ciToken = await ciTokenService.validateToken(rawToken, clientIp);

    return { ciToken };
  });
