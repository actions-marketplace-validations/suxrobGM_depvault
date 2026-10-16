import { Elysia } from "elysia";
import { container } from "@/common/di/container";
import { UnauthorizedError } from "@/common/errors/http.error";
import { getClientIp } from "@/common/utils/ip";
import { CiTokenService } from "./ci-token.service";

/** Validates a CI token from the Authorization header and injects context. */
export const ciTokenGuard = new Elysia({ name: "ci-token-guard" }).derive(
  { as: "scoped" },
  async ({ headers, request, server }) => {
    const rawToken = extractCiToken(headers);

    if (!rawToken) {
      throw new UnauthorizedError("Missing CI token");
    }

    const ciTokenService = container.resolve(CiTokenService);
    const clientIp = getClientIp(request, server);
    const ciToken = await ciTokenService.validateToken(rawToken, clientIp);

    return { ciToken, clientIp };
  },
);

function extractCiToken(headers: Record<string, string | undefined>): string | null {
  const authorization = headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice(7);
  }

  return null;
}
