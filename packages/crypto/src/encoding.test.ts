import { describe, expect, it } from "bun:test";
import { fromBase64, fromBase64Url, toBase64, toBase64Url } from "./encoding";

describe("base64", () => {
  it.each([0, 64, 1_048_576])("round-trips %i bytes", (size) => {
    const original = crypto.getRandomValues(new Uint8Array(size));
    expect(fromBase64(toBase64(original))).toEqual(original);
  });

  it("encodes a subarray view by its offset and length, not the whole backing buffer", () => {
    const backing = crypto.getRandomValues(new Uint8Array(64));
    expect(fromBase64(toBase64(backing.subarray(16, 48)))).toEqual(backing.slice(16, 48));
  });
});

describe("base64url", () => {
  it("round-trips with URL-safe characters only", () => {
    const original = crypto.getRandomValues(new Uint8Array(128));
    const encoded = toBase64Url(original);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(fromBase64Url(encoded)).toEqual(original);
  });
});
