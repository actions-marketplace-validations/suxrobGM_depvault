import { KeyGrantMismatchError, KeyGrantMissingError } from "@/lib/crypto/errors";

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
