/** Vault re-keying: password change, recovery, and recovery key regeneration. */

import {
  createRecoveryKey,
  deriveKEK,
  generateKeyPair,
  generateSalt,
  importPrivateKey,
  PBKDF2_ITERATIONS,
  parseRecoveryKey,
  type RecoveryKey,
  unwrapDek,
  type WrappedDek,
  wrapDek,
  wrapKey,
} from "@depvault/crypto";
import { client } from "@/api/client";
import { expectOk } from "@/api/request";
import {
  openVault,
  sealVault,
  unwrapRecoveryBytes,
  type VaultInfo,
  type VaultKeys,
} from "./vault-lifecycle";

interface ProjectGrant extends WrappedDek {
  projectId: string;
}

interface PasswordChangeResult {
  kek: CryptoKey;
  vaultInfo: VaultInfo;
}

interface RecoverVaultResult {
  keys: VaultKeys;
  vaultInfo: VaultInfo;
}

interface RegenerateRecoveryKeyResult {
  /** Formatted recovery key, shown to the user exactly once. */
  formatted: string;
  key: CryptoKey;
}

const fetchGrants = (type: "SELF" | "RECOVERY"): Promise<ProjectGrant[]> =>
  expectOk(client.api.vault.keygrants.get({ query: { type } }));

const rewrapGrants = (
  grants: ProjectGrant[],
  oldKey: CryptoKey,
  newKey: CryptoKey,
): Promise<ProjectGrant[]> =>
  Promise.all(
    grants.map(async ({ projectId, ...wrapped }) => ({
      projectId,
      ...(await wrapDek(await unwrapDek(wrapped, oldKey), newKey)),
    })),
  );

/**
 * Re-wraps the private key, recovery key and every SELF grant under a KEK from the new password.
 * The current password is re-checked: an unlocked browser alone mustn't be enough to change it.
 */
export async function changeVaultPasswordOps(
  currentPassword: string,
  newPassword: string,
  info: VaultInfo,
): Promise<PasswordChangeResult> {
  const salt = generateSalt();
  // The two PBKDF2 derivations are independent; grants are fetched only once the password is proven.
  const [{ kek: oldKek, privateKeyRaw }, newKek] = await Promise.all([
    openVault(currentPassword, info, "Current vault password is incorrect"),
    deriveKEK(newPassword, salt),
  ]);
  const recoveryBytes = await unwrapRecoveryBytes(info, oldKek);

  const [vaultInfo, selfGrants] = await Promise.all([
    sealVault({
      kek: newKek,
      salt,
      kekIterations: PBKDF2_ITERATIONS,
      publicKey: info.publicKey,
      privateKeyRaw,
      recoveryBytes,
    }),
    fetchGrants("SELF").then((grants) => rewrapGrants(grants, oldKek, newKek)),
  ]);
  const { publicKey: _publicKey, ...rekeyed } = vaultInfo;
  await expectOk(client.api.vault.password.put({ ...rekeyed, selfGrants }));

  return { kek: newKek, vaultInfo };
}

/**
 * Restores access with the recovery key: a new password and keypair, and a SELF grant for every
 * project the recovery key opens. Keys teammates shared for the old keypair are lost server-side.
 */
export async function recoverVaultOps(
  formattedRecoveryKey: string,
  newPassword: string,
): Promise<RecoverVaultResult> {
  let recovery: RecoveryKey;
  try {
    recovery = await parseRecoveryKey(formattedRecoveryKey);
  } catch {
    throw new Error("Incorrect recovery key");
  }

  const salt = generateSalt();
  const [newKek, keyPair, recoveryGrants] = await Promise.all([
    deriveKEK(newPassword, salt),
    generateKeyPair(),
    fetchGrants("RECOVERY"),
  ]);

  let selfGrants: ProjectGrant[];
  try {
    selfGrants = await rewrapGrants(recoveryGrants, recovery.key, newKek);
  } catch {
    throw new Error("Incorrect recovery key");
  }

  const vaultInfo = await sealVault({
    kek: newKek,
    salt,
    kekIterations: PBKDF2_ITERATIONS,
    publicKey: keyPair.publicKey,
    privateKeyRaw: keyPair.privateKeyRaw,
    recoveryBytes: recovery.bytes,
  });

  await expectOk(
    client.api.vault.recover.post({
      recoveryKeyHash: recovery.hash,
      ...vaultInfo,
      selfGrants,
    }),
  );

  const privateKey = await importPrivateKey(keyPair.privateKeyRaw);
  return { keys: { kek: newKek, privateKey, recoveryKey: recovery.key }, vaultInfo };
}

/** Replaces the recovery key and gives every project the user holds a fresh RECOVERY grant. */
export async function regenerateRecoveryKeyOps(
  kek: CryptoKey,
): Promise<RegenerateRecoveryKeyResult> {
  const recovery = await createRecoveryKey();
  const [wrappedRecovery, recoveryGrants] = await Promise.all([
    wrapKey(recovery.bytes, kek),
    fetchGrants("SELF").then((grants) => rewrapGrants(grants, kek, recovery.key)),
  ]);
  await expectOk(
    client.api.vault.recoverykey.put({
      newRecoveryKeyHash: recovery.hash,
      wrappedRecoveryKey: wrappedRecovery.wrapped,
      wrappedRecoveryKeyIv: wrappedRecovery.iv,
      wrappedRecoveryKeyTag: wrappedRecovery.tag,
      recoveryGrants,
    }),
  );

  return { formatted: recovery.formatted, key: recovery.key };
}
