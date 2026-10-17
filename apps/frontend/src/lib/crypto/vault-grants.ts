/** Project key grants: resolve the caller's DEK, create a project's first key, share it. */

import { deriveSharedKey, generateDEK, unwrapDek, wrapDek } from "@depvault/crypto";
import { client } from "@/api/client";
import { ApiRequestError, expectOk } from "@/api/request";
import { KeyGrantMismatchError, KeyGrantMissingError } from "./errors";
import type { VaultKeys } from "./vault-lifecycle";

/**
 * Fetches the caller's grant for a project and unwraps its DEK. A key a teammate shared is adopted
 * as the caller's own SELF + RECOVERY grants, since the shared copy dies with a vault recovery.
 * @throws {KeyGrantMissingError} when the user has no grant (HTTP 404).
 * @throws {KeyGrantMismatchError} when unwrap fails, typically a grant wrapped under a stale key.
 */
export async function resolveProjectDEK(projectId: string, keys: VaultKeys): Promise<CryptoKey> {
  const projectApi = client.api.projects({ id: projectId });
  const grant = await expectOk(projectApi.keygrants.my.get()).catch((err: unknown) => {
    throw err instanceof ApiRequestError && err.status === 404
      ? new KeyGrantMissingError(projectId)
      : err;
  });

  let dek: CryptoKey;
  try {
    const wrappingKey =
      grant.grantType === "ECDH"
        ? await deriveSharedKey(keys.privateKey, grant.granterPublicKey ?? "")
        : keys.kek;
    dek = await unwrapDek(grant, wrappingKey);
  } catch (cause) {
    throw new KeyGrantMismatchError(projectId, cause);
  }

  if (grant.grantType === "ECDH") {
    // Best-effort: the shared grant keeps working until adopted, and adoption retries next time.
    await storeOwnGrants(projectId, dek, keys).catch(() => null);
  }
  return dek;
}

/** Generates a new project's DEK and stores the caller's SELF + RECOVERY grants for it. */
export async function createProjectKey(projectId: string, keys: VaultKeys): Promise<CryptoKey> {
  const dek = await generateDEK();
  await storeOwnGrants(projectId, dek, keys);
  return dek;
}

/** Wraps the project DEK under an ECDH secret with a member's public key and stores it for them. */
export async function shareProjectKey(
  projectId: string,
  recipientUserId: string,
  recipientPublicKey: string,
  dek: CryptoKey,
  privateKey: CryptoKey,
): Promise<void> {
  const sharedKey = await deriveSharedKey(privateKey, recipientPublicKey);
  const wrapped = await wrapDek(dek, sharedKey);
  await expectOk(
    client.api.projects({ id: projectId }).keygrants.post({ userId: recipientUserId, ...wrapped }),
  );
}

async function storeOwnGrants(projectId: string, dek: CryptoKey, keys: VaultKeys): Promise<void> {
  const [self, recovery] = await Promise.all([
    wrapDek(dek, keys.kek),
    wrapDek(dek, keys.recoveryKey),
  ]);
  await expectOk(client.api.projects({ id: projectId }).keygrants.my.put({ self, recovery }));
}
