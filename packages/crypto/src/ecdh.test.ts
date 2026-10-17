import { describe, expect, it } from "bun:test";
import { deriveSharedKey, generateKeyPair, importPrivateKey } from "./ecdh";
import { generateDEK, unwrapDek, wrapDek } from "./keys";
import { sameKey } from "./test-helpers";

const party = async () => {
  const pair = await generateKeyPair();
  return { publicKey: pair.publicKey, privateKey: await importPrivateKey(pair.privateKeyRaw) };
};

describe("ECDH", () => {
  it("lets the recipient unwrap a DEK the granter wrapped under their shared secret", async () => {
    const [alice, bob] = await Promise.all([party(), party()]);

    const dek = await generateDEK();
    const stored = await wrapDek(dek, await deriveSharedKey(alice.privateKey, bob.publicKey));
    const restored = await unwrapDek(
      stored,
      await deriveSharedKey(bob.privateKey, alice.publicKey),
    );

    expect(await sameKey(dek, restored)).toBe(true);
  });

  it("keeps a third party out", async () => {
    const [alice, bob, eve] = await Promise.all([party(), party(), party()]);

    const stored = await wrapDek(
      await generateDEK(),
      await deriveSharedKey(alice.privateKey, bob.publicKey),
    );
    const eveKey = await deriveSharedKey(eve.privateKey, alice.publicKey);
    await expect(unwrapDek(stored, eveKey)).rejects.toThrow();
  });
});
