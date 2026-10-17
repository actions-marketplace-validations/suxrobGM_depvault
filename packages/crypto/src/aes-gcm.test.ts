import { describe, expect, it } from "bun:test";
import { decrypt, decryptBinary, encrypt, encryptBinary } from "./aes-gcm";
import { fromBase64, toBase64 } from "./encoding";
import { generateDEK } from "./keys";

const flipFirstByte = (b64: string): string => {
  const bytes = fromBase64(b64);
  bytes[0] = bytes[0]! ^ 0xff;
  return toBase64(bytes);
};

describe("encrypt / decrypt", () => {
  it.each(["hello world", "", "Hello 🌍🔐 你好世界", "A".repeat(12_000)])(
    "round-trips text %#",
    async (text) => {
      const dek = await generateDEK();
      const { ciphertext, iv, authTag } = await encrypt(text, dek);
      expect(await decrypt(ciphertext, iv, authTag, dek)).toBe(text);
    },
  );

  it("round-trips every byte value", async () => {
    const dek = await generateDEK();
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const { ciphertext, iv, authTag } = await encryptBinary(bytes, dek);
    expect(new Uint8Array(await decryptBinary(ciphertext, iv, authTag, dek))).toEqual(bytes);
  });

  it("uses a fresh IV per encryption", async () => {
    const dek = await generateDEK();
    const [a, b] = await Promise.all([encrypt("same", dek), encrypt("same", dek)]);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("rejects the wrong key, tampered ciphertext and a tampered tag", async () => {
    const dek = await generateDEK();
    const { ciphertext, iv, authTag } = await encrypt("secret", dek);

    await expect(decrypt(ciphertext, iv, authTag, await generateDEK())).rejects.toThrow();
    await expect(decrypt(flipFirstByte(ciphertext), iv, authTag, dek)).rejects.toThrow();
    await expect(decrypt(ciphertext, iv, flipFirstByte(authTag), dek)).rejects.toThrow();
  });
});
