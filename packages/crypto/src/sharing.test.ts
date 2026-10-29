import { describe, expect, it } from "bun:test";
import { decrypt, decryptBinary } from "./aes-gcm";
import { encryptForShare, shareKeyFromFragment } from "./sharing";

describe("share links", () => {
  it("decrypt text with the key from the URL-safe fragment", async () => {
    const share = await encryptForShare("one-time secret");
    expect(share.fragment).not.toMatch(/[+/=]/);

    const key = await shareKeyFromFragment(share.fragment);
    const text = await decrypt(share.encryptedPayload, share.iv, share.authTag, key);
    expect(text).toBe("one-time secret");
  });

  it("handle binary content", async () => {
    const bytes = new Uint8Array([0, 1, 2, 255]);
    const share = await encryptForShare(bytes.buffer);

    const key = await shareKeyFromFragment(share.fragment);
    const plain = await decryptBinary(share.encryptedPayload, share.iv, share.authTag, key);
    expect(new Uint8Array(plain)).toEqual(bytes);
  });

  it("reject an empty fragment", async () => {
    await expect(shareKeyFromFragment("")).rejects.toThrow();
  });
});
