/**
 * Validates a post-auth redirect target (e.g. `/cli/verify?code=ABCD-EFGH`).
 *
 * Returns the value only if it is a safe, same-origin relative path; otherwise `null`. This guards
 * against open-redirect attacks where a crafted target points at an external site.
 */
export function safeRedirect(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  // Must be a root-relative path ("/path"). Reject absolute URLs ("https://evil"),
  // protocol-relative ("//evil"), and backslash variants ("/\\evil") that some browsers
  // normalize to protocol-relative.
  if (!value.startsWith("/")) {
    return null;
  }
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  return value;
}

// Unreserved in URLs and absent from a UUID, so it cannot collide with the nonce.
const STATE_SEPARATOR = "~";

/**
 * Encodes the OAuth `state` parameter: a random nonce, optionally carrying the path the user
 * should land on after the round-trip. GitHub echoes `state` back verbatim, so this is what
 * survives the hop to the provider and back.
 */
export function encodeOAuthState(returnTo?: string | null): string {
  const nonce = crypto.randomUUID();
  const target = safeRedirect(returnTo);

  return target ? `${nonce}${STATE_SEPARATOR}${encodeURIComponent(target)}` : nonce;
}

/**
 * Recovers the post-auth return path from an OAuth `state` parameter.
 *
 * The value came back through a third party, so it is re-validated here — a crafted `state`
 * cannot turn the callback into an open redirect.
 */
export function decodeOAuthState(state: string | null | undefined): string | null {
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
    // Malformed percent-encoding — treat as no return path
    return null;
  }
}
