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

export { decrypt, decryptBinary, encrypt, encryptBinary } from "./aes-gcm";
export { deriveCIWrapKey, generateCiToken, hashCiBearerToken } from "./ci";
export { computeContentTag } from "./content-tag";
export { deriveSharedKey, generateKeyPair, importPrivateKey } from "./ecdh";
export {
  CRYPTO_CONSTANTS,
  fromBase64,
  fromBase64Url,
  PBKDF2_ITERATIONS,
  toBase64,
  toBase64Url,
} from "./encoding";
export {
  deriveKEK,
  exportDEK,
  generateDEK,
  generateSalt,
  importDEK,
  unwrapKey,
  wrapKey,
} from "./keys";
export { generateRecoveryKey, importRecoveryKey, recoveryKeyToBytes } from "./recovery";
export { generateShareKey, shareKeyFromFragment, shareKeyToFragment } from "./sharing";
export type * from "./vault-types";
