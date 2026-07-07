/**
 * CI token generation and key derivation.
 *
 * A CI token is generated client-side as `dvci_<authPart>.<keyPart>`. Only the bearer part
 * (`dvci_<authPart>`) is ever sent to the server, which stores its SHA-256 hash. The key part
 * stays on the client / in the pipeline and is the sole input to the DEK wrapping key, so the
 * server can never unwrap the project DEK.
 */

import { CRYPTO_CONSTANTS, getRandomBytes, toBase64Url } from "./encoding";

const { AES_KEY_LENGTH, HKDF_CI_INFO } = CRYPTO_CONSTANTS;

const CI_TOKEN_PREFIX = "dvci_";

export interface GeneratedCiToken {
  /** `dvci_<authPart>.<keyPart>` — shown to the user once, used verbatim as DEPVAULT_TOKEN. */
  fullToken: string;
  /** `dvci_<authPart>` — the only credential the server ever sees. */
  bearerToken: string;
  /** Key material for `deriveCIWrapKey`; never sent to the server. */
  keyPart: string;
  /** First 8 characters of the auth part, stored server-side for display. */
  tokenPrefix: string;
}

/** Generate a split CI token client-side (32 random bytes per part, base64url). */
export function generateCiToken(): GeneratedCiToken {
  const authPart = toBase64Url(getRandomBytes(32));
  const keyPart = toBase64Url(getRandomBytes(32));

  return {
    fullToken: `${CI_TOKEN_PREFIX}${authPart}.${keyPart}`,
    bearerToken: `${CI_TOKEN_PREFIX}${authPart}`,
    keyPart,
    tokenPrefix: authPart.slice(0, 8),
  };
}

/** SHA-256 hex of the bearer credential — matches the server's stored token hash. */
export async function hashCiBearerToken(bearerToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bearerToken));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Derive the DEK wrapping key from a CI token's key part using HKDF-SHA256. */
export async function deriveCIWrapKey(keyPart: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyPart),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(HKDF_CI_INFO),
    },
    keyMaterial,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}
