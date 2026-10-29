import { describe, expect, it } from "vitest";
import { buildFileTree, filterByPath } from "./file-tree";

const files = [
  { path: "apps/api/.env" },
  { path: "README.md" },
  { path: "apps/api/appsettings.json" },
  { path: "apps/web/.env.local" },
  { path: "deploy/prod.yaml" },
];

describe("buildFileTree", () => {
  it("nests files by folder with folders first and counts files recursively", () => {
    const root = buildFileTree(files);
    expect(root.fileCount).toBe(5);
    expect(root.folders.map((f) => f.name)).toEqual(["apps", "deploy"]);
    expect(root.files.map((f) => f.path)).toEqual(["README.md"]);

    const apps = root.folders[0]!;
    expect(apps.fileCount).toBe(3);
    expect(apps.folders.map((f) => f.path)).toEqual(["apps/api", "apps/web"]);
    expect(apps.folders[0]!.files.map((f) => f.path)).toEqual([
      "apps/api/.env",
      "apps/api/appsettings.json",
    ]);
  });
});

describe("filterByPath", () => {
  it("matches every term case-insensitively against the full path", () => {
    expect(filterByPath(files, "API env").map((f) => f.path)).toEqual(["apps/api/.env"]);
    expect(filterByPath(files, "  ")).toHaveLength(5);
  });
});
