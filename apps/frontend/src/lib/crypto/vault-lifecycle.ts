/** Vault status fetching, password-based unlock, and initial vault setup. */

import {
  createRecoveryKey,
  deriveKEK,
  fromBase64,
  generateKeyPair,
  generateSalt,
  importPrivateKey,
  importRecoveryKeyBytes,
  PBKDF2_ITERATIONS,
  toBase64,
  unwrapKey,
  type WrappedKey,
  wrapKey,
} from "@depvault/crypto";
import { client } from "@/api/client";
import { expectOk } from "@/api/request";

/** The server-stored vault: KEK salt plus the KEK-wrapped private and recovery keys. */
export interface VaultInfo {
  kekSalt: string;
  kekIterations: number;
  publicKey: string;
  wrappedPrivateKey: string;
  wrappedPrivateKeyIv: string;
  wrappedPrivateKeyTag: string;
  wrappedRecoveryKey: string;
  wrappedRecoveryKeyIv: string;
  wrappedRecoveryKeyTag: string;
}

/** Unlocked, non-extractable key material. */
export interface VaultKeys {
  kek: CryptoKey;
  privateKey: CryptoKey;
  recoveryKey: CryptoKey;
}

/** Raw key material to seal into a vault under `kek`. */
interface VaultKeyMaterial {
  kek: CryptoKey;
  salt: Uint8Array<ArrayBuffer>;
  kekIterations: number;
  publicKey: string;
  privateKeyRaw: Uint8Array<ArrayBuffer>;
  recoveryBytes: Uint8Array<ArrayBuffer>;
}

interface OpenedVault {
  kek: CryptoKey;
  privateKeyRaw: Uint8Array<ArrayBuffer>;
}

interface VaultSetupResult {
  keys: VaultKeys;
  vaultInfo: VaultInfo;
  /** Formatted recovery key, shown to the user exactly once. */
  recoveryKey: string;
}

/** Vault info fields for a KEK-wrapped private key. */
function privateKeyFields(wrapped: WrappedKey) {
  return {
    wrappedPrivateKey: wrapped.wrapped,
    wrappedPrivateKeyIv: wrapped.iv,
    wrappedPrivateKeyTag: wrapped.tag,
  };
}

/** Vault info fields for a KEK-wrapped recovery key. */
function recoveryKeyFields(wrapped: WrappedKey) {
  return {
    wrappedRecoveryKey: wrapped.wrapped,
    wrappedRecoveryKeyIv: wrapped.iv,
    wrappedRecoveryKeyTag: wrapped.tag,
  };
}

/** Fetches the vault, or null when the user hasn't set one up. Throws when the request fails. */
export async function fetchVaultInfo(): Promise<VaultInfo | null> {
  const { hasVault, setupUrl: _setupUrl, ...info } = await expectOk(client.api.vault.status.get());
  // `hasVault` guarantees every vault field is present.
  return hasVault ? (info as VaultInfo) : null;
}

/** Wraps the private and recovery keys under the KEK, giving the vault info to store. */
export async function sealVault(material: VaultKeyMaterial): Promise<VaultInfo> {
  const { kek, salt, kekIterations, publicKey, privateKeyRaw, recoveryBytes } = material;
  const [wrappedPrivate, wrappedRecovery] = await Promise.all([
    wrapKey(privateKeyRaw, kek),
    wrapKey(recoveryBytes, kek),
  ]);
  return {
    kekSalt: toBase64(salt),
    kekIterations,
    publicKey,
    ...privateKeyFields(wrappedPrivate),
    ...recoveryKeyFields(wrappedRecovery),
  };
}

/** Unwraps the KEK-wrapped recovery key bytes. */
export function unwrapRecoveryBytes(
  info: VaultInfo,
  kek: CryptoKey,
): Promise<Uint8Array<ArrayBuffer>> {
  return unwrapKey(
    info.wrappedRecoveryKey,
    info.wrappedRecoveryKeyIv,
    info.wrappedRecoveryKeyTag,
    kek,
  );
}

/**
 * Derives the KEK from the password and proves it by unwrapping the private key, throwing
 * `wrongPasswordMessage` when it doesn't open.
 */
export async function openVault(
  password: string,
  info: VaultInfo,
  wrongPasswordMessage: string,
): Promise<OpenedVault> {
  const kek = await deriveKEK(password, fromBase64(info.kekSalt), info.kekIterations);
  try {
    const privateKeyRaw = await unwrapKey(
      info.wrappedPrivateKey,
      info.wrappedPrivateKeyIv,
      info.wrappedPrivateKeyTag,
      kek,
    );
    return { kek, privateKeyRaw };
  } catch {
    throw new Error(wrongPasswordMessage);
  }
}

/** Derives the KEK from the password and unwraps the private and recovery keys. */
export async function unlockVaultKeys(password: string, info: VaultInfo): Promise<VaultKeys> {
  const { kek, privateKeyRaw } = await openVault(password, info, "Incorrect vault password");
  const [privateKey, recoveryKey] = await Promise.all([
    importPrivateKey(privateKeyRaw),
    unwrapRecoveryKey(kek, info),
  ]);
  return { kek, privateKey, recoveryKey };
}

/**
 * Unwraps the KEK-wrapped recovery key. A remembered session persists only the KEK and private
 * key, so it re-derives the recovery key this way instead of storing it.
 */
export async function unwrapRecoveryKey(kek: CryptoKey, info: VaultInfo): Promise<CryptoKey> {
  return (await importRecoveryKeyBytes(await unwrapRecoveryBytes(info, kek))).key;
}

/** Creates a vault: a new keypair and recovery key, both wrapped under the password's KEK. */
export async function createVault(password: string): Promise<VaultSetupResult> {
  const salt = generateSalt();
  const [kek, keyPair, recovery] = await Promise.all([
    deriveKEK(password, salt),
    generateKeyPair(),
    createRecoveryKey(),
  ]);
  const vaultInfo = await sealVault({
    kek,
    salt,
    kekIterations: PBKDF2_ITERATIONS,
    publicKey: keyPair.publicKey,
    privateKeyRaw: keyPair.privateKeyRaw,
    recoveryBytes: recovery.bytes,
  });
  await expectOk(client.api.vault.setup.post({ ...vaultInfo, recoveryKeyHash: recovery.hash }));

  return {
    keys: {
      kek,
      privateKey: await importPrivateKey(keyPair.privateKeyRaw),
      recoveryKey: recovery.key,
    },
    vaultInfo,
    recoveryKey: recovery.formatted,
  };
}
