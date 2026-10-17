/** Vault re-keying: password change, recovery, and recovery key regeneration. */

import {
  createRecoveryKey,
  deriveKEK,
  fromBase64,
  generateKeyPair,
  generateSalt,
  importPrivateKey,
  PBKDF2_ITERATIONS,
  parseRecoveryKey,
  type RecoveryKey,
  toBase64,
  unwrapDek,
  unwrapKey,
  type WrappedDek,
  wrapDek,
  wrapKey,
} from "@depvault/crypto";
import { client } from "@/api/client";
import { expectOk } from "./request";
import {
  privateKeyFields,
  recoveryKeyFields,
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
  /** The new KEK-wrapped recovery key, to merge into the cached vault info. */
  vaultInfo: Pick<
    VaultInfo,
    "wrappedRecoveryKey" | "wrappedRecoveryKeyIv" | "wrappedRecoveryKeyTag"
  >;
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

/** The re-key request fields describing a new KEK and the keys wrapped under it. */
const toRekeyFields = (info: VaultInfo) => ({
  newKekSalt: info.kekSalt,
  newKekIterations: info.kekIterations,
  newWrappedPrivateKey: info.wrappedPrivateKey,
  newWrappedPrivateKeyIv: info.wrappedPrivateKeyIv,
  newWrappedPrivateKeyTag: info.wrappedPrivateKeyTag,
  newWrappedRecoveryKey: info.wrappedRecoveryKey,
  newWrappedRecoveryKeyIv: info.wrappedRecoveryKeyIv,
  newWrappedRecoveryKeyTag: info.wrappedRecoveryKeyTag,
});

/**
 * Re-wraps the private key, recovery key and every SELF grant under a KEK from the new password.
 * The current password is re-checked: an unlocked browser alone mustn't be enough to change it.
 */
export async function changeVaultPasswordOps(
  currentPassword: string,
  newPassword: string,
  info: VaultInfo,
): Promise<PasswordChangeResult> {
  const oldKek = await deriveKEK(currentPassword, fromBase64(info.kekSalt), info.kekIterations);
  let privateKeyRaw: Uint8Array<ArrayBuffer>;
  try {
    privateKeyRaw = await unwrapKey(
      info.wrappedPrivateKey,
      info.wrappedPrivateKeyIv,
      info.wrappedPrivateKeyTag,
      oldKek,
    );
  } catch {
    throw new Error("Current vault password is incorrect");
  }
  const recoveryRaw = await unwrapKey(
    info.wrappedRecoveryKey,
    info.wrappedRecoveryKeyIv,
    info.wrappedRecoveryKeyTag,
    oldKek,
  );

  const salt = generateSalt();
  const newKek = await deriveKEK(newPassword, salt);
  const [wrappedPrivate, wrappedRecovery, selfGrants] = await Promise.all([
    wrapKey(privateKeyRaw, newKek),
    wrapKey(recoveryRaw, newKek),
    fetchGrants("SELF").then((grants) => rewrapGrants(grants, oldKek, newKek)),
  ]);

  const vaultInfo: VaultInfo = {
    ...info,
    kekSalt: toBase64(salt),
    kekIterations: PBKDF2_ITERATIONS,
    ...privateKeyFields(wrappedPrivate),
    ...recoveryKeyFields(wrappedRecovery),
  };
  await expectOk(client.api.vault.password.put({ ...toRekeyFields(vaultInfo), selfGrants }));

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

  const [wrappedPrivate, wrappedRecovery] = await Promise.all([
    wrapKey(keyPair.privateKeyRaw, newKek),
    wrapKey(recovery.bytes, newKek),
  ]);
  const vaultInfo: VaultInfo = {
    kekSalt: toBase64(salt),
    kekIterations: PBKDF2_ITERATIONS,
    publicKey: keyPair.publicKey,
    ...privateKeyFields(wrappedPrivate),
    ...recoveryKeyFields(wrappedRecovery),
  };

  await expectOk(
    client.api.vault.recover.post({
      recoveryKeyHash: recovery.hash,
      newPublicKey: keyPair.publicKey,
      ...toRekeyFields(vaultInfo),
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
  const vaultInfo = recoveryKeyFields(wrappedRecovery);

  await expectOk(
    client.api.vault.recoverykey.put({
      newRecoveryKeyHash: recovery.hash,
      newWrappedRecoveryKey: vaultInfo.wrappedRecoveryKey,
      newWrappedRecoveryKeyIv: vaultInfo.wrappedRecoveryKeyIv,
      newWrappedRecoveryKeyTag: vaultInfo.wrappedRecoveryKeyTag,
      recoveryGrants,
    }),
  );

  return { formatted: recovery.formatted, key: recovery.key, vaultInfo };
}
