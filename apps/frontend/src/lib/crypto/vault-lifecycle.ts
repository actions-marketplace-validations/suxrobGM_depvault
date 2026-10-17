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
import { expectOk } from "./request";

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

interface VaultSetupResult {
  keys: VaultKeys;
  vaultInfo: VaultInfo;
  /** Formatted recovery key, shown to the user exactly once. */
  recoveryKey: string;
}

/** Vault info fields for a KEK-wrapped private key. */
export function privateKeyFields(wrapped: WrappedKey) {
  return {
    wrappedPrivateKey: wrapped.wrapped,
    wrappedPrivateKeyIv: wrapped.iv,
    wrappedPrivateKeyTag: wrapped.tag,
  };
}

/** Vault info fields for a KEK-wrapped recovery key. */
export function recoveryKeyFields(wrapped: WrappedKey) {
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

/** Derives the KEK from the password and unwraps the private and recovery keys. */
export async function unlockVaultKeys(password: string, info: VaultInfo): Promise<VaultKeys> {
  const kek = await deriveKEK(password, fromBase64(info.kekSalt), info.kekIterations);

  let privateKey: CryptoKey;
  try {
    const raw = await unwrapKey(
      info.wrappedPrivateKey,
      info.wrappedPrivateKeyIv,
      info.wrappedPrivateKeyTag,
      kek,
    );
    privateKey = await importPrivateKey(raw);
  } catch {
    throw new Error("Incorrect vault password");
  }

  return { kek, privateKey, recoveryKey: await unwrapRecoveryKey(kek, info) };
}

/**
 * Unwraps the KEK-wrapped recovery key. A remembered session persists only the KEK and private
 * key, so it re-derives the recovery key this way instead of storing it.
 */
export async function unwrapRecoveryKey(kek: CryptoKey, info: VaultInfo): Promise<CryptoKey> {
  const bytes = await unwrapKey(
    info.wrappedRecoveryKey,
    info.wrappedRecoveryKeyIv,
    info.wrappedRecoveryKeyTag,
    kek,
  );
  return (await importRecoveryKeyBytes(bytes)).key;
}

/** Creates a vault: a new keypair and recovery key, both wrapped under the password's KEK. */
export async function createVault(password: string): Promise<VaultSetupResult> {
  const salt = generateSalt();
  const [kek, keyPair, recovery] = await Promise.all([
    deriveKEK(password, salt),
    generateKeyPair(),
    createRecoveryKey(),
  ]);
  const [wrappedPrivate, wrappedRecovery] = await Promise.all([
    wrapKey(keyPair.privateKeyRaw, kek),
    wrapKey(recovery.bytes, kek),
  ]);

  const vaultInfo: VaultInfo = {
    kekSalt: toBase64(salt),
    kekIterations: PBKDF2_ITERATIONS,
    publicKey: keyPair.publicKey,
    ...privateKeyFields(wrappedPrivate),
    ...recoveryKeyFields(wrappedRecovery),
  };
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
