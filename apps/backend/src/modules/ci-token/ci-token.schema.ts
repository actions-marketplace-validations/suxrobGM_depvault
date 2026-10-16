import { type Static, t } from "elysia";
import { PaginatedResponseSchema } from "@/types/response";

export const CreateCiTokenBodySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  appId: t.String({ format: "uuid" }),
  environmentSlug: t.String({ minLength: 1, description: "Environment the token is scoped to" }),
  expiresIn: t.Integer({
    minimum: 3600,
    maximum: 31536000,
    description: "Token lifetime in seconds (1h–1y)",
  }),
  ipAllowlist: t.Optional(
    t.Array(t.String({ minLength: 1 }), { description: "IP addresses or CIDR ranges" }),
  ),
  tokenHash: t.String({
    pattern: "^[0-9a-f]{64}$",
    description: "SHA-256 hex of the token's auth part (dvci_<authPart>), computed client-side",
  }),
  tokenPrefix: t.String({
    minLength: 8,
    maxLength: 8,
    description: "First 8 characters of the auth part, for display",
  }),
  wrappedDek: t.String({
    description:
      "DEK wrapped client-side under HKDF(keyPart); stored verbatim, server cannot unwrap",
  }),
  wrappedDekIv: t.String(),
  wrappedDekTag: t.String(),
});

const CiTokenResponseSchema = t.Object({
  id: t.String(),
  name: t.String(),
  tokenPrefix: t.String(),
  projectId: t.String(),
  appId: t.String(),
  appName: t.String(),
  environmentSlug: t.String(),
  ipAllowlist: t.Array(t.String()),
  expiresAt: t.Date(),
  lastUsedAt: t.Nullable(t.Date()),
  createdAt: t.Date(),
  createdByEmail: t.String(),
  tokenVersion: t.Integer({
    description: "1 = legacy (invalidated), 2 = zero-knowledge split token",
  }),
});

export const CiTokenCreatedResponseSchema = t.Object({
  id: t.String(),
  tokenPrefix: t.String(),
  expiresAt: t.Date(),
});

export const CiTokenListQuerySchema = t.Object({
  page: t.Integer({ minimum: 1, default: 1 }),
  limit: t.Integer({ minimum: 1, maximum: 100, default: 20 }),
});

export const CiTokenListResponseSchema = PaginatedResponseSchema(CiTokenResponseSchema);

export const CiTokenParamsSchema = t.Object({
  id: t.String(),
  tokenId: t.String(),
});

const CiFileSchema = t.Object({
  id: t.String(),
  kind: t.UnionEnum(["CONFIG", "SECRET"] as const),
  relativePath: t.String(),
  environmentSlug: t.Nullable(t.String()),
  format: t.Nullable(t.String()),
  mimeType: t.Nullable(t.String()),
  encryptedContent: t.String({ description: "Base64-encoded encrypted content" }),
  iv: t.String(),
  authTag: t.String(),
  isBinary: t.Boolean(),
});

export const CiSecretsResponseSchema = t.Object({
  wrappedDek: t.Nullable(t.String()),
  wrappedDekIv: t.Nullable(t.String()),
  wrappedDekTag: t.Nullable(t.String()),
  files: t.Array(CiFileSchema),
});

export const CiFileParamsSchema = t.Object({
  fileId: t.String(),
});

export const CiFileDownloadResponseSchema = t.Object({
  encryptedContent: t.String({ description: "Base64-encoded encrypted file content" }),
  iv: t.String(),
  authTag: t.String(),
  relativePath: t.String(),
  mimeType: t.String(),
});

export type CreateCiTokenBody = Static<typeof CreateCiTokenBodySchema>;
export type CiTokenResponse = Static<typeof CiTokenResponseSchema>;
export type CiTokenCreatedResponse = Static<typeof CiTokenCreatedResponseSchema>;
export type CiFile = Static<typeof CiFileSchema>;
export type CiSecretsResponse = Static<typeof CiSecretsResponseSchema>;
export type CiFileDownloadResponse = Static<typeof CiFileDownloadResponseSchema>;
