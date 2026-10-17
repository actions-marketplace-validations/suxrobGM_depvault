import "reflect-metadata";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { ConflictError } from "@/common/errors/http.error";
import { Prisma, type PrismaClient } from "@/generated/prisma";
import type { DeepMockProxy } from "@/types/deep-mock";
import { RepoFileRepository } from "./repo-file.repository";

const projectId = "project-uuid";
const userId = "user-uuid";
const now = new Date();

function makeFile(overrides: Record<string, unknown> = {}) {
  return {
    id: "file-1",
    projectId,
    path: ".env",
    version: 3,
    encryptedContent: new Uint8Array(Buffer.from("old")),
    iv: "iv",
    authTag: "tag",
    contentHash: "hash-old",
    fileSize: 3,
    isBinary: false,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const content = {
  encryptedContent: Buffer.from("new").toString("base64"),
  iv: "iv2",
  authTag: "tag2",
  contentHash: "hash-new",
  fileSize: 3,
  isBinary: false,
};

let tx: DeepMockProxy<PrismaClient>;
let repository: RepoFileRepository;

beforeEach(() => {
  tx = {
    repoFile: {
      findFirst: mock(() => Promise.resolve(makeFile())),
      update: mock(() => Promise.resolve(makeFile({ version: 4 }))),
      create: mock(() => Promise.resolve(makeFile({ id: "file-new", version: 1 }))),
      deleteMany: mock(() => Promise.resolve({ count: 1 })),
    },
    repoFileVersion: { create: mock(() => Promise.resolve({})) },
  } as unknown as DeepMockProxy<PrismaClient>;

  const prisma = {
    $transaction: mock((fn: (client: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaClient;
  repository = new RepoFileRepository(prisma);
});

describe("RepoFileRepository", () => {
  describe("applyChanges", () => {
    it("should bump the version and snapshot the new state on update", async () => {
      const result = await repository.applyChanges(
        projectId,
        userId,
        [{ fileId: "file-1", baseVersion: 3, content }],
        "rotate",
      );

      expect(tx.repoFile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "file-1", version: 3 },
          data: expect.objectContaining({ contentHash: "hash-new", version: 4 }),
        }),
      );
      expect(tx.repoFileVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ version: 4, changedBy: userId, message: "rotate" }),
      });
      expect(result.files[0]!.version).toBe(4);
    });

    it("should reject a stale baseVersion with 409 and write nothing", async () => {
      expect(
        repository.applyChanges(
          projectId,
          userId,
          [{ fileId: "file-1", baseVersion: 2, content }],
          null,
        ),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(tx.repoFile.update).not.toHaveBeenCalled();
    });

    it("should treat a file deleted by someone else as a conflict", async () => {
      tx.repoFile.findFirst.mockResolvedValueOnce(null);

      expect(
        repository.applyChanges(
          projectId,
          userId,
          [{ fileId: "file-1", baseVersion: 3, delete: true }],
          null,
        ),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("should treat a lost version race as a conflict", async () => {
      tx.repoFile.update.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("No record found", {
          code: "P2025",
          clientVersion: "test",
        }),
      );

      expect(
        repository.applyChanges(
          projectId,
          userId,
          [{ fileId: "file-1", baseVersion: 3, content }],
          null,
        ),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("should move a file keeping its id and history", async () => {
      tx.repoFile.update.mockResolvedValueOnce(makeFile({ path: ".env.development", version: 4 }));

      const result = await repository.applyChanges(
        projectId,
        userId,
        [{ fileId: "file-1", baseVersion: 3, path: ".env.development" }],
        null,
      );

      expect(tx.repoFile.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { path: ".env.development", version: 4 } }),
      );
      expect(result.previousPaths.get("file-1")).toBe(".env");
      expect(result.files[0]!.id).toBe("file-1");
    });

    it("should skip a no-op update without bumping the version", async () => {
      const result = await repository.applyChanges(
        projectId,
        userId,
        [{ fileId: "file-1", baseVersion: 3, content: { ...content, contentHash: "hash-old" } }],
        null,
      );

      expect(tx.repoFile.update).not.toHaveBeenCalled();
      expect(tx.repoFileVersion.create).not.toHaveBeenCalled();
      expect(result.files[0]!.version).toBe(3);
    });

    it("should run deletes before creates so a path can be reused in one batch", async () => {
      const order: string[] = [];
      tx.repoFile.deleteMany.mockImplementationOnce(() => {
        order.push("delete");
        return Promise.resolve({ count: 1 });
      });
      tx.repoFile.create.mockImplementationOnce(() => {
        order.push("create");
        return Promise.resolve(makeFile({ id: "file-new", version: 1 }));
      });

      const result = await repository.applyChanges(
        projectId,
        userId,
        [
          { path: ".env", content },
          { fileId: "file-1", baseVersion: 3, delete: true },
        ],
        null,
      );

      expect(order).toEqual(["delete", "create"]);
      expect(result.deletedIds).toEqual(["file-1"]);
    });
  });
});
