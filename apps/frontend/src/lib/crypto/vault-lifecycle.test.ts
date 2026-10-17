import { generateDEK, parseRecoveryKey, unwrapDek, wrapDek } from "@depvault/crypto";
import { sameKey } from "@depvault/crypto/test-helpers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/api/request";
import { api, fail, ok } from "./test-client";
import { buildVault } from "./test-vault";
import { createVault, fetchVaultInfo, unlockVaultKeys, type VaultInfo } from "./vault-lifecycle";

vi.mock("@/api/client", () => import("./test-client"));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("fetchVaultInfo", () => {
  it("returns null when the user has no vault", async () => {
    api.status.mockReturnValue(ok({ hasVault: false, setupUrl: "https://x" }));
    expect(await fetchVaultInfo()).toBeNull();
  });

  it("returns only the vault fields", async () => {
    const { info } = await buildVault();
    api.status.mockReturnValue(ok({ hasVault: true, ...info }));
    expect(await fetchVaultInfo()).toEqual(info);
  });

  it("throws on a failed request instead of reporting no vault", async () => {
    api.status.mockReturnValue(fail(500));
    await expect(fetchVaultInfo()).rejects.toBeInstanceOf(ApiRequestError);
  });
});

describe("unlockVaultKeys", () => {
  it("unlocks the private and recovery keys with the right password", async () => {
    const vault = await buildVault("right");
    const keys = await unlockVaultKeys("right", vault.info);

    const dek = await generateDEK();
    const stored = await wrapDek(dek, vault.keys.recoveryKey);
    expect(await sameKey(dek, await unwrapDek(stored, keys.recoveryKey))).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const vault = await buildVault("right");
    await expect(unlockVaultKeys("wrong", vault.info)).rejects.toThrow("Incorrect vault password");
  });
});

describe("createVault", () => {
  it("posts a vault the same password unlocks, with the recovery key's hash", async () => {
    api.setup.mockReturnValue(ok({ message: "ok" }));

    const result = await createVault("correct horse");

    const [body] = api.setup.mock.calls[0] as [VaultInfo & { recoveryKeyHash: string }];
    const { recoveryKeyHash, ...posted } = body;
    expect(posted).toEqual(result.vaultInfo);
    expect(recoveryKeyHash).toBe((await parseRecoveryKey(result.recoveryKey)).hash);
    await expect(unlockVaultKeys("correct horse", result.vaultInfo)).resolves.toBeDefined();
  });

  it("throws when the server rejects the setup", async () => {
    api.setup.mockReturnValue(fail(409, "Vault is already set up"));
    await expect(createVault("pw")).rejects.toThrow("Vault is already set up");
  });
});
