/** Return `value` only if it is a same-origin relative path, else `null` (open-redirect guard). */
export function safeRedirect(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (!value.startsWith("/")) {
    return null;
  }
  // Some browsers normalize "/\\evil" to protocol-relative "//evil".
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  return value;
}

// Unreserved in URLs and absent from a UUID, so it cannot collide with the nonce.
const STATE_SEPARATOR = "~";

/**
 * Encode the OAuth `state` as a random nonce plus an optional return path; the provider echoes
 * `state` verbatim, so the path survives the round-trip.
 */
export function encodeOAuthState(returnTo: string | null = null): string {
  const nonce = crypto.randomUUID();
  const target = safeRedirect(returnTo);

  return target ? `${nonce}${STATE_SEPARATOR}${encodeURIComponent(target)}` : nonce;
}

/** Recover the return path from an OAuth `state`, re-validated against open redirects. */
export function decodeOAuthState(state: string | null): string | null {
  if (!state) {
    return null;
  }

  const separatorIndex = state.indexOf(STATE_SEPARATOR);
  if (separatorIndex === -1) {
    return null;
  }

  try {
    return safeRedirect(decodeURIComponent(state.slice(separatorIndex + 1)));
  } catch {
    return null;
  }
}
