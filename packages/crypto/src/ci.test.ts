import { describe, expect, it } from "bun:test";
import { createCiTokenMaterial, deriveCIWrapKey, generateCiToken, hashCiBearerToken } from "./ci";
import { generateDEK, unwrapDek, wrapDek } from "./keys";
import { sameKey } from "./test-helpers";

describe("CI tokens", () => {
  it("split into a dot-free bearer part and key part", () => {
    const token = generateCiToken();

    expect(token.fullToken).toBe(`${token.bearerToken}.${token.keyPart}`);
    expect(token.bearerToken).toStartWith(`dvci_${token.tokenPrefix}`);
    expect(token.bearerToken).not.toContain(".");
    expect(token.keyPart).not.toContain(".");
    expect(token.tokenPrefix).toHaveLength(8);
  });

  it("hash the bearer part to deterministic 64-char lowercase hex", async () => {
    const [a, b, other] = await Promise.all([
      hashCiBearerToken("dvci_abc"),
      hashCiBearerToken("dvci_abc"),
      hashCiBearerToken("dvci_abd"),
    ]);

    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(other);
  });

  it("derive the wrap key from the key part alone", async () => {
    const stored = await wrapDek(await generateDEK(), await deriveCIWrapKey("token-one"));

    await expect(unwrapDek(stored, await deriveCIWrapKey("token-one"))).resolves.toBeDefined();
    await expect(unwrapDek(stored, await deriveCIWrapKey("token-two"))).rejects.toThrow();
  });

  it("send the server only the bearer hash and a DEK wrapped under the key part", async () => {
    const dek = await generateDEK();
    const material = await createCiTokenMaterial(dek);

    const [bearer, keyPart] = material.fullToken.split(".") as [string, string];
    expect(material.tokenHash).toBe(await hashCiBearerToken(bearer));
    expect(bearer).toStartWith(`dvci_${material.tokenPrefix}`);

    // Simulates the CLI deriving the wrap key independently from the key part.
    const restored = await unwrapDek(material, await deriveCIWrapKey(keyPart));
    expect(await sameKey(dek, restored)).toBe(true);
  });
});
