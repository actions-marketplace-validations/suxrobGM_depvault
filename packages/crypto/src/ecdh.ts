/** ECDH P-256 keypair generation, import, and shared key derivation. */

import { AES_KEY_LENGTH, fromBase64, toBase64 } from "./encoding";

export interface ECDHKeyPair {
  publicKey: string;
  privateKeyRaw: Uint8Array<ArrayBuffer>;
}

/** Generate an ECDH P-256 keypair. Returns base64 public key and raw private key bytes. */
export async function generateKeyPair(): Promise<ECDHKeyPair> {
  const keyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveKey",
  ]);

  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const privateKeyRaw = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  return {
    publicKey: toBase64(publicKeyRaw),
    privateKeyRaw: new Uint8Array(privateKeyRaw),
  };
}

async function importPublicKey(publicKeyBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    fromBase64(publicKeyBase64),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}

/** Import a PKCS8 ECDH private key from raw bytes. */
export async function importPrivateKey(privateKeyRaw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    privateKeyRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey"],
  );
}

/** Derive a shared AES-256-GCM key from an ECDH private key and a recipient's public key. */
export async function deriveSharedKey(
  privateKey: CryptoKey,
  publicKeyBase64: string,
): Promise<CryptoKey> {
  const publicKey = await importPublicKey(publicKeyBase64);

  return crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}
