import {
  createRecoveryKey,
  deriveKEK,
  type GeneratedRecoveryKey,
  generateKeyPair,
  generateSalt,
  importPrivateKey,
} from "@depvault/crypto";
import { FAST_ITERATIONS } from "@depvault/crypto/test-helpers";
import { sealVault, type VaultInfo, type VaultKeys } from "./vault-lifecycle";

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
  const info = await sealVault({
    kek,
    salt,
    kekIterations: FAST_ITERATIONS,
    publicKey: keyPair.publicKey,
    privateKeyRaw: keyPair.privateKeyRaw,
    recoveryBytes: recovery.bytes,
  });
  const privateKey = await importPrivateKey(keyPair.privateKeyRaw);
  return { info, keys: { kek, privateKey, recoveryKey: recovery.key }, recovery };
}
