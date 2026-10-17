import { type Static, t } from "elysia";
import { KeyGrantType } from "@/generated/prisma";

const Base64 = t.String({ minLength: 1 });

const wrappedDekFields = {
  wrappedDek: Base64,
  wrappedDekIv: Base64,
  wrappedDekTag: Base64,
};

const WrappedDekSchema = t.Object(wrappedDekFields);

const ProjectWrappedDekSchema = t.Object({
  projectId: t.String({ format: "uuid" }),
  ...wrappedDekFields,
});

const wrappedPrivateKeyFields = {
  newWrappedPrivateKey: Base64,
  newWrappedPrivateKeyIv: Base64,
  newWrappedPrivateKeyTag: Base64,
};

const wrappedRecoveryKeyFields = {
  newWrappedRecoveryKey: Base64,
  newWrappedRecoveryKeyIv: Base64,
  newWrappedRecoveryKeyTag: Base64,
};

const newKekFields = {
  newKekSalt: Base64,
  newKekIterations: t.Integer({ minimum: 100000 }),
};

export const SetupVaultBodySchema = t.Object({
  kekSalt: Base64,
  kekIterations: t.Integer({ minimum: 100000 }),
  publicKey: Base64,
  wrappedPrivateKey: Base64,
  wrappedPrivateKeyIv: Base64,
  wrappedPrivateKeyTag: Base64,
  recoveryKeyHash: Base64,
  wrappedRecoveryKey: Base64,
  wrappedRecoveryKeyIv: Base64,
  wrappedRecoveryKeyTag: Base64,
});

export const ChangeVaultPasswordBodySchema = t.Object({
  ...newKekFields,
  ...wrappedPrivateKeyFields,
  ...wrappedRecoveryKeyFields,
  selfGrants: t.Array(ProjectWrappedDekSchema, {
    description: "Every SELF grant the user holds, re-wrapped under the new KEK",
  }),
});

export const RecoverVaultBodySchema = t.Object({
  recoveryKeyHash: t.String({
    minLength: 1,
    description: "SHA-256 (base64) of the recovery key, proving the caller holds it",
  }),
  ...newKekFields,
  newPublicKey: Base64,
  ...wrappedPrivateKeyFields,
  ...wrappedRecoveryKeyFields,
  selfGrants: t.Array(ProjectWrappedDekSchema, {
    description: "One SELF grant per RECOVERY grant, wrapped under the new KEK",
  }),
});

export const RegenerateRecoveryKeyBodySchema = t.Object({
  newRecoveryKeyHash: Base64,
  ...wrappedRecoveryKeyFields,
  recoveryGrants: t.Array(ProjectWrappedDekSchema, {
    description: "One RECOVERY grant per SELF grant, wrapped under the new recovery key",
  }),
});

export const VaultStatusResponseSchema = t.Object({
  hasVault: t.Boolean(),
  kekSalt: t.Optional(t.String()),
  kekIterations: t.Optional(t.Integer()),
  publicKey: t.Optional(t.String()),
  wrappedPrivateKey: t.Optional(t.String()),
  wrappedPrivateKeyIv: t.Optional(t.String()),
  wrappedPrivateKeyTag: t.Optional(t.String()),
  wrappedRecoveryKey: t.Optional(t.String()),
  wrappedRecoveryKeyIv: t.Optional(t.String()),
  wrappedRecoveryKeyTag: t.Optional(t.String()),
  setupUrl: t.Optional(
    t.String({ description: "Web dashboard URL where the vault is set up (for CLI guidance)" }),
  ),
});

export const GrantListQuerySchema = t.Object({
  type: t.Union([t.Literal(KeyGrantType.SELF), t.Literal(KeyGrantType.RECOVERY)]),
});

export const GrantListItemSchema = t.Object({
  projectId: t.String(),
  wrappedDek: t.String(),
  wrappedDekIv: t.String(),
  wrappedDekTag: t.String(),
});

export const StoreOwnGrantsBodySchema = t.Object({
  self: WrappedDekSchema,
  recovery: WrappedDekSchema,
});

export const ShareKeyGrantBodySchema = t.Object({
  userId: t.String({ format: "uuid" }),
  ...wrappedDekFields,
});

export const KeyGrantResponseSchema = t.Object({
  wrappedDek: t.String(),
  wrappedDekIv: t.String(),
  wrappedDekTag: t.String(),
  granterPublicKey: t.Nullable(t.String()),
  grantType: t.Enum(KeyGrantType),
});

export const PendingGrantMemberSchema = t.Object({
  userId: t.String(),
  email: t.String(),
  firstName: t.String(),
  lastName: t.String(),
  hasVault: t.Boolean(),
  publicKey: t.Nullable(t.String()),
});

export type SetupVaultBody = Static<typeof SetupVaultBodySchema>;
export type ChangeVaultPasswordBody = Static<typeof ChangeVaultPasswordBodySchema>;
export type RecoverVaultBody = Static<typeof RecoverVaultBodySchema>;
export type RegenerateRecoveryKeyBody = Static<typeof RegenerateRecoveryKeyBodySchema>;
export type StoreOwnGrantsBody = Static<typeof StoreOwnGrantsBodySchema>;
export type ShareKeyGrantBody = Static<typeof ShareKeyGrantBodySchema>;
export type ProjectWrappedDek = Static<typeof ProjectWrappedDekSchema>;
