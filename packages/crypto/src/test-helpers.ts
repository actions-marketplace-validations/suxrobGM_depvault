import { decrypt, encrypt } from "./aes-gcm";
import { deriveKEK, generateSalt } from "./keys";

/** Low PBKDF2 cost so key derivation doesn't dominate test time. */
export const FAST_ITERATIONS = 1000;

/** A KEK derived cheaply from `password` and a fresh salt. */
export function testKek(password = "password"): Promise<CryptoKey> {
  return deriveKEK(password, generateSalt(), FAST_ITERATIONS);
}

/** Whether `restored` decrypts what `original` encrypted, i.e. they're the same key. */
export async function sameKey(original: CryptoKey, restored: CryptoKey): Promise<boolean> {
  const enc = await encrypt("probe", original);
  return (await decrypt(enc.ciphertext, enc.iv, enc.authTag, restored)) === "probe";
}
