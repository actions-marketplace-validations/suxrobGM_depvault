/** Project-level key grant operations: resolve, create SELF/RECOVERY/ECDH grants. */

import {
  deriveSharedKey,
  exportDEK,
  generateDEK,
  importDEK,
  unwrapKey,
  wrapKey,
} from "@depvault/crypto";
import { client } from "@/api/client";
import { KeyGrantMismatchError, KeyGrantMissingError } from "./errors";

/**
 * Fetches the user's key grant for a project and unwraps its DEK.
 * @throws {KeyGrantMissingError} when the user has no grant (HTTP 404).
 * @throws {KeyGrantMismatchError} when unwrap fails, typically a grant wrapped under a stale KEK.
 */
export async function resolveProjectDEK(
  projectId: string,
  kek: CryptoKey,
  privateKey: CryptoKey | null,
): Promise<CryptoKey> {
  const { data: grant, error } = await client.api.projects({ id: projectId }).keygrants.my.get();

  if (error) {
    // Eden's inferred error type omits 404 (only the success shape is declared), but the
    // backend returns 404 when the grant is absent.
    if ((error.status as number) === 404) {
      throw new KeyGrantMissingError(projectId);
    }
    throw new Error(`Failed to fetch key grant: ${String(error.value)}`);
  }

  if (!grant) {
    throw new KeyGrantMissingError(projectId);
  }

  let dekRaw: Uint8Array<ArrayBuffer>;
  try {
    if (grant.grantType === "SELF") {
      dekRaw = await unwrapKey(grant.wrappedDek, grant.wrappedDekIv, grant.wrappedDekTag, kek);
    } else if (grant.grantType === "ECDH" && grant.granterPublicKey) {
      if (!privateKey) {
        throw new Error("Private key not available");
      }

      const sharedKey = await deriveSharedKey(privateKey, grant.granterPublicKey);
      dekRaw = await unwrapKey(
        grant.wrappedDek,
        grant.wrappedDekIv,
        grant.wrappedDekTag,
        sharedKey,
      );
    } else {
      throw new Error(`Unsupported grant type: ${grant.grantType}`);
    }
  } catch (cause) {
    if (cause instanceof Error && cause.name === "OperationError") {
      throw new KeyGrantMismatchError(projectId, cause);
    }
    // AES-GCM unwrap failures have no stable error name across browsers; treat any as a mismatch.
    if (grant.grantType === "SELF" || grant.grantType === "ECDH") {
      throw new KeyGrantMismatchError(projectId, cause);
    }
    throw cause;
  }

  return importDEK(dekRaw);
}

/** Generates a new DEK, wraps it with KEK, and creates a SELF key grant. Returns the DEK. */
export async function createProjectSelfGrant(
  projectId: string,
  userId: string,
  kek: CryptoKey,
): Promise<CryptoKey> {
  const dek = await generateDEK();
  const dekRaw = await exportDEK(dek);
  const wrapped = await wrapKey(dekRaw, kek);

  await client.api.projects({ id: projectId }).keygrants.post({
    userId,
    wrappedDek: wrapped.wrapped,
    wrappedDekIv: wrapped.iv,
    wrappedDekTag: wrapped.tag,
    grantType: "SELF",
  });

  return dek;
}

/** Wraps a DEK with the recovery key and creates a RECOVERY key grant. */
export async function createProjectRecoveryGrant(
  projectId: string,
  userId: string,
  dek: CryptoKey,
  recoveryKey: CryptoKey,
): Promise<void> {
  const dekRaw = await exportDEK(dek);
  const wrapped = await wrapKey(dekRaw, recoveryKey);

  await client.api.projects({ id: projectId }).keygrants.post({
    userId,
    wrappedDek: wrapped.wrapped,
    wrappedDekIv: wrapped.iv,
    wrappedDekTag: wrapped.tag,
    grantType: "RECOVERY",
  });
}

/** Wraps a project DEK with an ECDH shared key and creates a grant for a team member. */
export async function createProjectECDHGrant(
  projectId: string,
  recipientUserId: string,
  recipientPublicKey: string,
  dek: CryptoKey,
  privateKey: CryptoKey,
  granterPublicKey: string,
): Promise<void> {
  const dekRaw = await exportDEK(dek);
  const sharedKey = await deriveSharedKey(privateKey, recipientPublicKey);
  const wrapped = await wrapKey(dekRaw, sharedKey);

  await client.api.projects({ id: projectId }).keygrants.post({
    userId: recipientUserId,
    wrappedDek: wrapped.wrapped,
    wrappedDekIv: wrapped.iv,
    wrappedDekTag: wrapped.tag,
    granterPublicKey,
    grantType: "ECDH",
  });
}
