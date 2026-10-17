import { describe, expect, it } from "bun:test";
import { toBase64 } from "./encoding";
import { generateDEK, unwrapDek, wrapDek } from "./keys";
import { createRecoveryKey, importRecoveryKeyBytes, parseRecoveryKey } from "./recovery";
import { sameKey } from "./test-helpers";

describe("recovery key", () => {
  it("formats 32 bytes as dash-separated groups of up to 4", async () => {
    const recovery = await createRecoveryKey();
    expect(recovery.bytes.length).toBe(32);
    expect(recovery.formatted).toMatch(/^[A-Za-z0-9+/]{1,4}(-[A-Za-z0-9+/]{1,4})+$/);
  });

  it("parses back, ignoring surrounding whitespace, to the same bytes and hash", async () => {
    const recovery = await createRecoveryKey();
    const parsed = await parseRecoveryKey(` ${recovery.formatted} `);
    expect(parsed.bytes).toEqual(recovery.bytes);
    expect(parsed.hash).toBe(recovery.hash);
  });

  it("hashes to the base64 SHA-256 of its bytes", async () => {
    const recovery = await createRecoveryKey();
    expect(recovery.hash).toBe(toBase64(await crypto.subtle.digest("SHA-256", recovery.bytes)));
  });

  it("unwraps grants after re-import from its bytes", async () => {
    const recovery = await createRecoveryKey();
    const dek = await generateDEK();
    const stored = await wrapDek(dek, recovery.key);

    const reimported = await importRecoveryKeyBytes(recovery.bytes);
    expect(await sameKey(dek, await unwrapDek(stored, reimported.key))).toBe(true);
  });
});
