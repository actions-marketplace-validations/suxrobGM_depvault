import { describe, expect, it } from "bun:test";
import {
  deriveKEK,
  exportDEK,
  generateDEK,
  generateSalt,
  importDEK,
  unwrapDek,
  wrapDek,
} from "./keys";
import { FAST_ITERATIONS, sameKey, testKek } from "./test-helpers";

describe("deriveKEK", () => {
  it("is deterministic for the same password and salt", async () => {
    const salt = generateSalt();
    const dek = await generateDEK();
    const stored = await wrapDek(dek, await deriveKEK("pw", salt, FAST_ITERATIONS));

    const again = await deriveKEK("pw", salt, FAST_ITERATIONS);
    expect(await sameKey(dek, await unwrapDek(stored, again))).toBe(true);
  });

  it("differs when the password or the salt differs", async () => {
    const salt = generateSalt();
    const stored = await wrapDek(await generateDEK(), await deriveKEK("pw", salt, FAST_ITERATIONS));

    const otherPassword = await deriveKEK("other", salt, FAST_ITERATIONS);
    const otherSalt = await deriveKEK("pw", generateSalt(), FAST_ITERATIONS);
    await expect(unwrapDek(stored, otherPassword)).rejects.toThrow();
    await expect(unwrapDek(stored, otherSalt)).rejects.toThrow();
  });
});

describe("DEK", () => {
  it("is an extractable 256-bit AES-GCM key that survives export/import", async () => {
    const dek = await generateDEK();
    expect(dek.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
    expect(dek.extractable).toBe(true);

    const raw = await exportDEK(dek);
    expect(raw.length).toBe(32);
    expect(await sameKey(dek, await importDEK(raw))).toBe(true);
  });

  it("wrapDek → unwrapDek round-trips in the API field shape", async () => {
    const kek = await testKek();
    const dek = await generateDEK();

    const stored = await wrapDek(dek, kek);
    expect(Object.keys(stored).sort()).toEqual(["wrappedDek", "wrappedDekIv", "wrappedDekTag"]);
    expect(await sameKey(dek, await unwrapDek(stored, kek))).toBe(true);
  });

  it("unwrapDek with the wrong key throws", async () => {
    const stored = await wrapDek(await generateDEK(), await testKek("a"));
    await expect(unwrapDek(stored, await testKek("b"))).rejects.toThrow();
  });
});
