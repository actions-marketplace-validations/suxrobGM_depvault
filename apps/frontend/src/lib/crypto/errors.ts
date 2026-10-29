/**
 * Thrown by resolveProjectDEK so callers can choose re-granting vs. a mismatch warning. Never
 * silently overwrite the grant: that would orphan data encrypted under the original DEK.
 */
export class KeyGrantMissingError extends Error {
  constructor(projectId: string) {
    super(`No key grant for project ${projectId}`);
    this.name = "KeyGrantMissingError";
  }
}

export class KeyGrantMismatchError extends Error {
  constructor(projectId: string, cause: unknown) {
    super(
      `Key grant for project ${projectId} could not be unwrapped: the stored grant was wrapped with a different key than your current vault KEK.`,
      { cause },
    );
    this.name = "KeyGrantMismatchError";
  }
}
/** User-facing explanation of why a file could not be decrypted. */
export function describeKeyError(
  error: unknown,
  fallback = "Failed to decrypt this file.",
): string {
  if (error instanceof KeyGrantMissingError) {
    return "You don't have this project's encryption key yet. Ask an owner or editor to open the Files tab and grant you access.";
  }
  if (error instanceof KeyGrantMismatchError) {
    return "Your key for this project could not be unlocked with your current vault keys.";
  }
  return fallback;
}
