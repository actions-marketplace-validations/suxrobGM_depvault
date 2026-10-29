import {
  generateDEK,
  parseRecoveryKey,
  unwrapDek,
  type WrappedDek,
  wrapDek,
} from "@depvault/crypto";
import { sameKey } from "@depvault/crypto/test-helpers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, fail, ok } from "./test-client";
import { buildVault } from "./test-vault";
import { unlockVaultKeys } from "./vault-lifecycle";
import { changeVaultPasswordOps, recoverVaultOps, regenerateRecoveryKeyOps } from "./vault-rekey";

vi.mock("@/api/client", () => import("./test-client"));

/**
 * Highest-risk frontend code: a dropped or mis-wrapped DEK leaves data undecryptable and the
 * server has no copy. Each test checks the re-wrapped grants against the original DEK.
 */

interface ProjectGrant extends WrappedDek {
  projectId: string;
}

const projectGrant = async (projectId: string, dek: CryptoKey, key: CryptoKey) => ({
  projectId,
  ...(await wrapDek(dek, key)),
});

beforeEach(() => {
  vi.resetAllMocks();
  api.changePassword.mockReturnValue(ok({ message: "ok" }));
  api.recover.mockReturnValue(ok({ message: "ok" }));
  api.regenerateRecoveryKey.mockReturnValue(ok({ message: "ok" }));
});

describe("changeVaultPasswordOps", () => {
  it("re-wraps every SELF grant and the vault under the new password", async () => {
    const vault = await buildVault("old");
    const dek = await generateDEK();
    api.listGrants.mockReturnValue(ok([await projectGrant("p1", dek, vault.keys.kek)]));

    const result = await changeVaultPasswordOps("old", "new", vault.info);

    expect(api.listGrants).toHaveBeenCalledWith({ query: { type: "SELF" } });
    const [body] = api.changePassword.mock.calls[0] as [{ selfGrants: ProjectGrant[] }];
    expect(body.selfGrants.map((g) => g.projectId)).toEqual(["p1"]);
    expect(await sameKey(dek, await unwrapDek(body.selfGrants[0]!, result.kek))).toBe(true);
    await expect(unlockVaultKeys("new", result.vaultInfo)).resolves.toBeDefined();
  });

  it("rejects a wrong current password before touching the server", async () => {
    const vault = await buildVault("old");

    await expect(changeVaultPasswordOps("guess", "new", vault.info)).rejects.toThrow(
      "Current vault password is incorrect",
    );
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("throws when the server rejects the batch", async () => {
    const vault = await buildVault("old");
    api.listGrants.mockReturnValue(ok([]));
    api.changePassword.mockReturnValue(fail(409, "Your project keys changed"));

    await expect(changeVaultPasswordOps("old", "new", vault.info)).rejects.toThrow(
      "Your project keys changed",
    );
  });
});

describe("recoverVaultOps", () => {
  it("proves the recovery key and rebuilds SELF grants under a new password", async () => {
    const vault = await buildVault();
    const dek = await generateDEK();
    api.listGrants.mockReturnValue(ok([await projectGrant("p1", dek, vault.keys.recoveryKey)]));

    const result = await recoverVaultOps(vault.recovery.formatted, "new");

    expect(api.listGrants).toHaveBeenCalledWith({ query: { type: "RECOVERY" } });
    const [body] = api.recover.mock.calls[0] as [
      { recoveryKeyHash: string; publicKey: string; selfGrants: ProjectGrant[] },
    ];
    expect(body.recoveryKeyHash).toBe(vault.recovery.hash);
    expect(body.publicKey).toBe(result.vaultInfo.publicKey);
    expect(body.publicKey).not.toBe(vault.info.publicKey);
    expect(await sameKey(dek, await unwrapDek(body.selfGrants[0]!, result.keys.kek))).toBe(true);
    await expect(unlockVaultKeys("new", result.vaultInfo)).resolves.toBeDefined();
  });

  it("works for a user with no projects", async () => {
    const vault = await buildVault();
    api.listGrants.mockReturnValue(ok([]));

    await recoverVaultOps(vault.recovery.formatted, "new");

    expect(api.recover).toHaveBeenCalled();
  });

  it("rejects a recovery key that doesn't open the grants", async () => {
    const [vault, other] = await Promise.all([buildVault(), buildVault()]);
    api.listGrants.mockReturnValue(
      ok([await projectGrant("p1", await generateDEK(), vault.keys.recoveryKey)]),
    );

    await expect(recoverVaultOps(other.recovery.formatted, "new")).rejects.toThrow(
      "Incorrect recovery key",
    );
    expect(api.recover).not.toHaveBeenCalled();
  });
});

describe("regenerateRecoveryKeyOps", () => {
  it("gives every SELF-held project a RECOVERY grant under the new key", async () => {
    const vault = await buildVault();
    const dek = await generateDEK();
    api.listGrants.mockReturnValue(ok([await projectGrant("p1", dek, vault.keys.kek)]));

    const result = await regenerateRecoveryKeyOps(vault.keys.kek);

    expect(api.listGrants).toHaveBeenCalledWith({ query: { type: "SELF" } });
    const [body] = api.regenerateRecoveryKey.mock.calls[0] as [
      { newRecoveryKeyHash: string; recoveryGrants: ProjectGrant[] },
    ];
    expect(body.newRecoveryKeyHash).toBe((await parseRecoveryKey(result.formatted)).hash);
    expect(await sameKey(dek, await unwrapDek(body.recoveryGrants[0]!, result.key))).toBe(true);
  });
});
