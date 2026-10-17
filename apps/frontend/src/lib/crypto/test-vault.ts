import {
  createRecoveryKey,
  decrypt,
  deriveKEK,
  encryptBinary,
  type GeneratedRecoveryKey,
  generateKeyPair,
  generateSalt,
  importPrivateKey,
  toBase64,
  wrapKey,
} from "@depvault/crypto";
import {
  privateKeyFields,
  recoveryKeyFields,
  type VaultInfo,
  type VaultKeys,
} from "./vault-lifecycle";

/** Low PBKDF2 cost so key derivation doesn't dominate test time. */
const FAST_ITERATIONS = 1000;

interface TestVault {
  info: VaultInfo;
  keys: VaultKeys;
  recovery: GeneratedRecoveryKey;
}

/** A real vault (keypair + recovery key wrapped under the password's KEK) built cheaply. */
export async function buildVault(password = "password"): Promise<TestVault> {
  const salt = generateSalt();
  const [kek, keyPair, recovery] = await Promise.all([
    deriveKEK(password, salt, FAST_ITERATIONS),
    generateKeyPair(),
    createRecoveryKey(),
  ]);
  const info: VaultInfo = {
    kekSalt: toBase64(salt),
    kekIterations: FAST_ITERATIONS,
    publicKey: keyPair.publicKey,
    ...privateKeyFields(await wrapKey(keyPair.privateKeyRaw, kek)),
    ...recoveryKeyFields(await wrapKey(recovery.bytes, kek)),
  };
  const privateKey = await importPrivateKey(keyPair.privateKeyRaw);
  return { info, keys: { kek, privateKey, recoveryKey: recovery.key }, recovery };
}

/** Whether `restored` decrypts what `original` encrypted, i.e. they're the same key. */
export async function sameKey(original: CryptoKey, restored: CryptoKey): Promise<boolean> {
  const enc = await encryptBinary(new TextEncoder().encode("probe"), original);
  return (await decrypt(enc.ciphertext, enc.iv, enc.authTag, restored)) === "probe";
}
