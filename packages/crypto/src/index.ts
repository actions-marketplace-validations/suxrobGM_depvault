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

export { decrypt, decryptBinary, encryptBinary } from "./aes-gcm";
export { type CiTokenMaterial, createCiTokenMaterial } from "./ci";
export { computeContentTag } from "./content-tag";
export { deriveSharedKey, generateKeyPair, importPrivateKey } from "./ecdh";
export { fromBase64, PBKDF2_ITERATIONS, toBase64 } from "./encoding";
export {
  deriveKEK,
  generateDEK,
  generateSalt,
  unwrapDek,
  unwrapKey,
  type WrappedDek,
  type WrappedKey,
  wrapDek,
  wrapKey,
} from "./keys";
export {
  createRecoveryKey,
  type GeneratedRecoveryKey,
  importRecoveryKeyBytes,
  parseRecoveryKey,
  type RecoveryKey,
} from "./recovery";
export { encryptForShare, shareKeyFromFragment } from "./sharing";
