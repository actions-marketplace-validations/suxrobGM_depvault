import "reflect-metadata";
import { beforeEach, describe, expect, it } from "bun:test";
import { baseCiToken, createCiTokenService } from "./ci-token.test-helpers";

const file = (path: string) => ({
  id: `id-${path}`,
  path,
  encryptedContent: Buffer.from("cipher"),
  iv: "iv",
  authTag: "tag",
  isBinary: false,
});

const files = [
  file(".env"),
  file("deploy/.env"),
  file("deploy/secrets/box-a/.env"),
  file("apps/api/.env"),
];

describe("CiTokenService", () => {
  let ctx: ReturnType<typeof createCiTokenService>;

  beforeEach(() => {
    ctx = createCiTokenService();
    // The repository first lists paths, then loads the matching ids.
    ctx.prisma.repoFile.findMany.mockImplementation(((args: { where: { id?: { in: string[] } } }) =>
      Promise.resolve(
        files.filter((f) => !args.where.id || args.where.id.in.includes(f.id)),
      )) as never);
  });

  describe("fetchFiles", () => {
    it("should return the wrapped DEK and every file when the token has no path globs", async () => {
      const result = await ctx.service.fetchFiles({ ...baseCiToken }, "run-1", "127.0.0.1");

      expect(result.wrappedDek).toBe("wrapped-dek");
      expect(result.files).toHaveLength(files.length);
      expect(result.files[0]!.encryptedContent).toBe(Buffer.from("cipher").toString("base64"));
      expect(ctx.audit.log).toHaveBeenCalled();
    });

    it.each([
      ["a folder glob", ["deploy/**"], ["deploy/.env", "deploy/secrets/box-a/.env"]],
      ["a bare name (root file only)", [".env"], [".env"]],
      [
        "a double-star prefix (any depth)",
        ["**/.env"],
        [".env", "deploy/.env", "deploy/secrets/box-a/.env", "apps/api/.env"],
      ],
    ])("should only return files matching %s", async (_, paths, expected) => {
      const result = await ctx.service.fetchFiles({ ...baseCiToken, paths }, null, "127.0.0.1");

      expect(result.files.map((f) => f.path)).toEqual(expected);
    });
  });
});
