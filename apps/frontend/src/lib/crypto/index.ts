/**
 * End-to-end encryption module using the WebCrypto API.
 *
 * Key hierarchy:
 *   Vault Password → (PBKDF2) → KEK → wraps/unwraps DEKs and ECDH private key
 *   DEK (per project) → AES-256-GCM encrypt/decrypt of secrets
 *   Recovery Key → independently wraps each project DEK
 *   ECDH P-256 keypair → team key distribution
 *   Share Key (ephemeral) → one-time share links
 *   CI Wrap Key (HKDF from token) → wraps DEK for CI pipelines
 */

export { VaultReauthRequiredError } from "./errors";
export {
  createProjectECDHGrant,
  createProjectRecoveryGrant,
  createProjectSelfGrant,
  resolveProjectDEK,
} from "./vault-grants";
export { createVault, fetchVaultInfo, unlockVaultKeys } from "./vault-lifecycle";
export { changeVaultPasswordOps, recoverVaultOps, regenerateRecoveryKeyOps } from "./vault-rekey";
