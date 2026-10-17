/**
 * Split CI tokens: `dvci_<authPart>.<keyPart>`, generated client-side. The server sees only the
 * bearer part (`dvci_<authPart>`) and stores its SHA-256 hash. The key part is the sole input to
 * the DEK wrapping key and never leaves the client/pipeline, so the server cannot unwrap the DEK.
 */

import { AES_KEY_LENGTH, getRandomBytes, toBase64Url } from "./encoding";
import { type WrappedDek, wrapDek } from "./keys";

const CI_TOKEN_PREFIX = "dvci_";
const HKDF_CI_INFO = "depvault-ci-wrap";

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

export interface CiTokenMaterial extends WrappedDek {
  /** Shown to the user once; never sent to the server. */
  fullToken: string;
  tokenHash: string;
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

/**
 * A new CI token for a project: the server gets the auth-part hash and the DEK wrapped under the
 * key part, so it can authenticate the token but never unwrap the DEK.
 */
export async function createCiTokenMaterial(dek: CryptoKey): Promise<CiTokenMaterial> {
  const token = generateCiToken();
  const [wrapped, tokenHash] = await Promise.all([
    deriveCIWrapKey(token.keyPart).then((key) => wrapDek(dek, key)),
    hashCiBearerToken(token.bearerToken),
  ]);
  return { fullToken: token.fullToken, tokenHash, tokenPrefix: token.tokenPrefix, ...wrapped };
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
