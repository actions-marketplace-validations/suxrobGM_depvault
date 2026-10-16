import { describe, expect, it } from "bun:test";
import { decodeOAuthState, encodeOAuthState, safeRedirect } from "@depvault/shared/utils";

describe("OAuth state round-trip", () => {
  it("should carry a return path through encode/decode", () => {
    const state = encodeOAuthState("/cli/verify?code=ABCD-EFGH");

    expect(decodeOAuthState(state)).toBe("/cli/verify?code=ABCD-EFGH");
  });

  it("should produce a distinct nonce per call", () => {
    expect(encodeOAuthState("/overview")).not.toBe(encodeOAuthState("/overview"));
  });

  it("should decode to null when no return path was carried", () => {
    expect(decodeOAuthState(encodeOAuthState())).toBeNull();
    expect(decodeOAuthState(encodeOAuthState(null))).toBeNull();
  });

  it("should refuse to encode an unsafe target", () => {
    expect(decodeOAuthState(encodeOAuthState("https://evil.example"))).toBeNull();
    expect(decodeOAuthState(encodeOAuthState("//evil.example"))).toBeNull();
  });

  it("should re-validate on decode, since state came back through a third party", () => {
    // A crafted state must not turn the callback into an open redirect
    expect(decodeOAuthState(`nonce~${encodeURIComponent("https://evil.example")}`)).toBeNull();
    expect(decodeOAuthState(`nonce~${encodeURIComponent("//evil.example")}`)).toBeNull();
  });

  it("should tolerate malformed state", () => {
    expect(decodeOAuthState(undefined)).toBeNull();
    expect(decodeOAuthState("")).toBeNull();
    expect(decodeOAuthState("no-separator")).toBeNull();
    expect(decodeOAuthState("nonce~%E0%A4%A")).toBeNull();
  });
});

describe("safeRedirect", () => {
  it("should accept root-relative paths and reject everything else", () => {
    expect(safeRedirect("/overview")).toBe("/overview");
    expect(safeRedirect("https://evil.example")).toBeNull();
    expect(safeRedirect("//evil.example")).toBeNull();
    expect(safeRedirect("/\\evil.example")).toBeNull();
    expect(safeRedirect(null)).toBeNull();
  });
});
