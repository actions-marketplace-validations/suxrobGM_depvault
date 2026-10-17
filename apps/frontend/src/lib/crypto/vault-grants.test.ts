import {
  deriveSharedKey,
  generateDEK,
  unwrapDek,
  type WrappedDek,
  wrapDek,
} from "@depvault/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/api/request";
import { KeyGrantMismatchError, KeyGrantMissingError } from "./errors";
import { api, fail, ok } from "./test-client";
import { buildVault, sameKey } from "./test-vault";
import { createProjectKey, resolveProjectDEK, shareProjectKey } from "./vault-grants";

vi.mock("@/api/client", () => import("./test-client"));

interface OwnGrants {
  self: WrappedDek;
  recovery: WrappedDek;
}

beforeEach(() => {
  vi.resetAllMocks();
  api.storeMyGrants.mockReturnValue(ok({ message: "ok" }));
  api.shareGrant.mockReturnValue(ok({ message: "ok" }));
});

describe("resolveProjectDEK", () => {
  it("unwraps a SELF grant with the KEK without re-storing it", async () => {
    const { keys } = await buildVault();
    const dek = await generateDEK();
    api.getMyGrant.mockReturnValue(
      ok({ ...(await wrapDek(dek, keys.kek)), grantType: "SELF", granterPublicKey: null }),
    );

    expect(await sameKey(dek, await resolveProjectDEK("p1", keys))).toBe(true);
    expect(api.storeMyGrants).not.toHaveBeenCalled();
  });

  it("unwraps a shared grant and adopts it as own SELF + RECOVERY grants", async () => {
    const [granter, me] = await Promise.all([buildVault(), buildVault()]);
    const dek = await generateDEK();
    const shared = await deriveSharedKey(granter.keys.privateKey, me.info.publicKey);
    api.getMyGrant.mockReturnValue(
      ok({
        ...(await wrapDek(dek, shared)),
        grantType: "ECDH",
        granterPublicKey: granter.info.publicKey,
      }),
    );

    expect(await sameKey(dek, await resolveProjectDEK("p1", me.keys))).toBe(true);

    const [, body] = api.storeMyGrants.mock.calls[0] as [unknown, OwnGrants];
    expect(await sameKey(dek, await unwrapDek(body.self, me.keys.kek))).toBe(true);
    expect(await sameKey(dek, await unwrapDek(body.recovery, me.keys.recoveryKey))).toBe(true);
  });

  it("still returns the DEK when adopting a shared grant fails", async () => {
    const [granter, me] = await Promise.all([buildVault(), buildVault()]);
    const dek = await generateDEK();
    const shared = await deriveSharedKey(granter.keys.privateKey, me.info.publicKey);
    api.getMyGrant.mockReturnValue(
      ok({
        ...(await wrapDek(dek, shared)),
        grantType: "ECDH",
        granterPublicKey: granter.info.publicKey,
      }),
    );
    api.storeMyGrants.mockReturnValue(fail(500));

    expect(await sameKey(dek, await resolveProjectDEK("p1", me.keys))).toBe(true);
  });

  it("creates the project's first key when nobody holds one", async () => {
    const { keys } = await buildVault();
    api.getMyGrant.mockReturnValue(fail(404));
    api.storeMyGrants.mockReturnValue(ok({ message: "ok" }));

    const dek = await resolveProjectDEK("p1", keys);

    const body = api.storeMyGrants.mock.calls[0]?.[1] as OwnGrants;
    expect(await sameKey(dek, await unwrapDek(body.self, keys.kek))).toBe(true);
  });

  it("throws KeyGrantMissingError on 404 when another member already holds the key", async () => {
    const { keys } = await buildVault();
    api.getMyGrant.mockReturnValue(fail(404));
    api.storeMyGrants.mockReturnValue(fail(409));

    await expect(resolveProjectDEK("p1", keys)).rejects.toBeInstanceOf(KeyGrantMissingError);
  });

  it("passes other failures through", async () => {
    const { keys } = await buildVault();
    api.getMyGrant.mockReturnValue(fail(500));

    await expect(resolveProjectDEK("p1", keys)).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("throws KeyGrantMismatchError when the grant was wrapped under another key", async () => {
    const [mine, other] = await Promise.all([buildVault(), buildVault()]);
    api.getMyGrant.mockReturnValue(
      ok({
        ...(await wrapDek(await generateDEK(), other.keys.kek)),
        grantType: "SELF",
        granterPublicKey: null,
      }),
    );

    await expect(resolveProjectDEK("p1", mine.keys)).rejects.toBeInstanceOf(KeyGrantMismatchError);
  });
});

describe("createProjectKey", () => {
  it("stores SELF + RECOVERY grants for a new DEK in one request", async () => {
    const { keys } = await buildVault();

    const dek = await createProjectKey("p1", keys);

    expect(api.storeMyGrants).toHaveBeenCalledTimes(1);
    const [params, body] = api.storeMyGrants.mock.calls[0] as [unknown, OwnGrants];
    expect(params).toEqual({ id: "p1" });
    expect(await sameKey(dek, await unwrapDek(body.self, keys.kek))).toBe(true);
    expect(await sameKey(dek, await unwrapDek(body.recovery, keys.recoveryKey))).toBe(true);
  });

  it("throws when the server refuses the key", async () => {
    const { keys } = await buildVault();
    api.storeMyGrants.mockReturnValue(fail(409, "This project already has an encryption key."));

    await expect(createProjectKey("p1", keys)).rejects.toThrow("already has an encryption key");
  });
});

describe("shareProjectKey", () => {
  it("wraps the DEK so only the recipient's keypair opens it", async () => {
    const [granter, recipient] = await Promise.all([buildVault(), buildVault()]);
    const dek = await generateDEK();

    await shareProjectKey("p1", "u2", recipient.info.publicKey, dek, granter.keys.privateKey);

    const [, body] = api.shareGrant.mock.calls[0] as [unknown, WrappedDek & { userId: string }];
    expect(body.userId).toBe("u2");
    const shared = await deriveSharedKey(recipient.keys.privateKey, granter.info.publicKey);
    expect(await sameKey(dek, await unwrapDek(body, shared))).toBe(true);
  });
});
