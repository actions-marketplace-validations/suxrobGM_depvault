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
      `Key grant for project ${projectId} could not be unwrapped — the stored grant was wrapped with a different key than your current vault KEK.`,
      { cause },
    );
    this.name = "KeyGrantMismatchError";
  }
}
