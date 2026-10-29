import { createHmac, hkdfSync } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { computeContentTag } from "./content-tag";
import { importDEK } from "./keys";

describe("computeContentTag", () => {
  const rawDek = new Uint8Array(32).map((_, i) => i);
  const plaintext = new TextEncoder().encode("DATABASE_URL=postgres://localhost\n");

  it("should match HMAC-SHA256 keyed by HKDF(DEK, 'depvault-content-tag') like the CLI", async () => {
    const tagKey = Buffer.from(
      hkdfSync("sha256", rawDek, new Uint8Array(0), "depvault-content-tag", 32),
    );
    const expected = createHmac("sha256", tagKey).update(plaintext).digest("base64");

    expect(await computeContentTag(plaintext, await importDEK(rawDek))).toBe(expected);
  });

  it("should differ across DEKs for the same content", async () => {
    const other = await importDEK(new Uint8Array(32).fill(7));

    expect(await computeContentTag(plaintext, other)).not.toBe(
      await computeContentTag(plaintext, await importDEK(rawDek)),
    );
  });
});
