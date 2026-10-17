import { Elysia, t } from "elysia";
import { container } from "@/common/di/container";
import { authGuard } from "@/common/middleware/auth.middleware";
import { rateLimiter } from "@/common/middleware/rate-limiter";
import { MessageResponseSchema, TooManyRequestsErrorSchema } from "@/types/response";
import { KeyGrantService } from "./key-grant.service";
import {
  ChangeVaultPasswordBodySchema,
  GrantListItemSchema,
  GrantListQuerySchema,
  RecoverVaultBodySchema,
  RegenerateRecoveryKeyBodySchema,
  SetupVaultBodySchema,
  VaultStatusResponseSchema,
} from "./vault.schema";
import { VaultService } from "./vault.service";

const vaultService = container.resolve(VaultService);
const keyGrantService = container.resolve(KeyGrantService);

/** Read + setup endpoints (unthrottled). */
const vaultCoreController = new Elysia({
  prefix: "/vault",
  detail: { tags: ["Vault"], security: [{ bearerAuth: [] }] },
})
  .use(authGuard)
  .get("/status", ({ user }) => vaultService.getStatus(user.id), {
    response: VaultStatusResponseSchema,
    detail: {
      operationId: "getVaultStatus",
      summary: "Get vault status",
      description: "Check whether the authenticated user has set up their encryption vault.",
    },
  })
  .post("/setup", ({ user, body }) => vaultService.setup(user.id, body), {
    body: SetupVaultBodySchema,
    response: MessageResponseSchema,
    detail: {
      operationId: "setupVault",
      summary: "Set up vault",
      description:
        "Initialize the user's encryption vault with a KEK salt, ECDH keypair, and recovery key hash.",
    },
  })
  .get("/keygrants", ({ user, query }) => keyGrantService.listForUser(user.id, query.type), {
    query: GrantListQuerySchema,
    response: t.Array(GrantListItemSchema),
    detail: {
      operationId: "listMyKeyGrants",
      summary: "List my key grants",
      description: "Fetch the current user's SELF or RECOVERY grants across all projects.",
    },
  });

/** Recovery is a brute-force target (guessing recovery keys with a stolen session) — 5/hour per IP. */
const vaultRecoverController = new Elysia({
  prefix: "/vault",
  detail: { tags: ["Vault"], security: [{ bearerAuth: [] }] },
})
  .use(rateLimiter({ max: 5, windowMs: 60 * 60 * 1000 }))
  .use(authGuard)
  .post("/recover", ({ user, body }) => vaultService.recover(user.id, body), {
    body: RecoverVaultBodySchema,
    response: { 200: MessageResponseSchema, ...TooManyRequestsErrorSchema },
    detail: {
      operationId: "recoverVault",
      summary: "Recover vault",
      description:
        "Recover vault access using the recovery key. Sets a new vault password and re-wraps all keys.",
    },
  });

/** Re-key mutations overwrite all wrapped keys — throttled to blunt abuse of a stolen session. */
const vaultRekeyController = new Elysia({
  prefix: "/vault",
  detail: { tags: ["Vault"], security: [{ bearerAuth: [] }] },
})
  .use(rateLimiter({ max: 10, windowMs: 60 * 60 * 1000 }))
  .use(authGuard)
  .put("/password", ({ user, body }) => vaultService.changePassword(user.id, body), {
    body: ChangeVaultPasswordBodySchema,
    response: { 200: MessageResponseSchema, ...TooManyRequestsErrorSchema },
    detail: {
      operationId: "changeVaultPassword",
      summary: "Change vault password",
      description:
        "Update the vault password by providing new wrapped keys and re-wrapped project key grants.",
    },
  })
  .put("/recoverykey", ({ user, body }) => vaultService.regenerateRecoveryKey(user.id, body), {
    body: RegenerateRecoveryKeyBodySchema,
    response: { 200: MessageResponseSchema, ...TooManyRequestsErrorSchema },
    detail: {
      operationId: "regenerateRecoveryKey",
      summary: "Regenerate recovery key",
      description:
        "Generate a new recovery key while the vault is unlocked. Re-wraps all RECOVERY grants.",
    },
  });

export const vaultController = new Elysia()
  .use(vaultCoreController)
  .use(vaultRecoverController)
  .use(vaultRekeyController);
