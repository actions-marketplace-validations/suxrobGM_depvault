import type { Route } from "next";
import { describe, expect, it } from "vitest";
import { safeRedirect, withRedirect } from "./url";

const LOGIN = "/login" as Route;

describe("safeRedirect", () => {
  it("accepts a root-relative path (incl. query string)", () => {
    expect(safeRedirect("/cli/verify?code=ABCD-EFGH")).toBe("/cli/verify?code=ABCD-EFGH");
    expect(safeRedirect("/overview")).toBe("/overview");
  });

  it("rejects empty or missing values", () => {
    expect(safeRedirect(null)).toBeNull();
    expect(safeRedirect(undefined)).toBeNull();
    expect(safeRedirect("")).toBeNull();
  });

  it("rejects absolute and protocol-relative URLs (open-redirect guard)", () => {
    expect(safeRedirect("https://evil.example")).toBeNull();
    expect(safeRedirect("//evil.example")).toBeNull();
    expect(safeRedirect("/\\evil.example")).toBeNull();
    expect(safeRedirect("evil")).toBeNull();
  });
});

describe("withRedirect", () => {
  it("appends the encoded return path", () => {
    expect(withRedirect(LOGIN, "/cli/verify?code=ABCD-EFGH")).toBe(
      "/login?redirect=%2Fcli%2Fverify%3Fcode%3DABCD-EFGH",
    );
  });

  it("returns the bare route when there is nothing to return to", () => {
    expect(withRedirect(LOGIN, null)).toBe("/login");
    expect(withRedirect(LOGIN, undefined)).toBe("/login");
    expect(withRedirect(LOGIN, "")).toBe("/login");
    expect(withRedirect(LOGIN, "/")).toBe("/login");
  });

  it("drops unsafe targets rather than propagating them", () => {
    expect(withRedirect(LOGIN, "https://evil.example")).toBe("/login");
    expect(withRedirect(LOGIN, "//evil.example")).toBe("/login");
  });
});
