import "reflect-metadata";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { BadRequestError } from "@/common/errors/http.error";
import type { AuditLogService } from "@/modules/audit-log";
import type { PlanEnforcementService } from "@/modules/subscription/plan-enforcement.service";
import type { DeepMockProxy } from "@/types/deep-mock";
import type { RepoFileRepository } from "./repo-file.repository";
import type { RepoFileChange } from "./repo-file.schema";
import { RepoFileService } from "./repo-file.service";

const projectId = "project-uuid";
const userId = "user-uuid";
const fileId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const now = new Date();

function makeFile(overrides: Record<string, unknown> = {}) {
  return {
    id: fileId,
    projectId,
    path: "apps/api/.env",
    version: 1,
    encryptedContent: Buffer.from("cipher"),
    iv: "iv",
    authTag: "tag",
    contentHash: "hash-1",
    fileSize: 6,
    isBinary: false,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const content = {
  encryptedContent: Buffer.from("cipher").toString("base64"),
  iv: "iv",
  authTag: "tag",
  contentHash: "hash-2",
  fileSize: 6,
  isBinary: false,
};

let repository: DeepMockProxy<RepoFileRepository>;
let audit: DeepMockProxy<AuditLogService>;
let plan: DeepMockProxy<PlanEnforcementService>;
let service: RepoFileService;

beforeEach(() => {
  repository = {
    list: mock(() => Promise.resolve([makeFile()])),
    findMany: mock(() => Promise.resolve([makeFile()])),
    requireFile: mock(() => Promise.resolve(makeFile())),
    listVersions: mock(() => Promise.resolve([])),
    requireVersion: mock(() => Promise.resolve(null)),
    findUserNames: mock(() => Promise.resolve([])),
    applyChanges: mock(() =>
      Promise.resolve({ files: [], deletedIds: [], previousPaths: new Map() }),
    ),
  } as unknown as DeepMockProxy<RepoFileRepository>;
  audit = {
    log: mock(() => Promise.resolve()),
    logMany: mock(() => Promise.resolve()),
  } as unknown as DeepMockProxy<AuditLogService>;
  plan = {
    enforceForProject: mock(() => Promise.resolve()),
  } as unknown as DeepMockProxy<PlanEnforcementService>;
  service = new RepoFileService(
    repository as unknown as RepoFileRepository,
    audit as unknown as AuditLogService,
    plan as unknown as PlanEnforcementService,
  );
});

function apply(changes: RepoFileChange[]) {
  return service.applyChanges(projectId, userId, { changes }, "127.0.0.1");
}

describe("RepoFileService", () => {
  describe("applyChanges", () => {
    it("should only enforce the file limit for net new files", async () => {
      await apply([{ fileId, baseVersion: 1, content }]);
      expect(plan.enforceForProject).not.toHaveBeenCalled();

      await apply([
        { path: "a/.env", content },
        { path: "b/.env", content },
        { fileId, baseVersion: 1, delete: true },
      ]);
      expect(plan.enforceForProject).toHaveBeenCalledWith(projectId, "repoFile", 1);
    });

    it("should reject non-canonical paths", async () => {
      for (const path of [
        "apps\\api\\.env",
        "/abs/.env",
        "a//b",
        "./a",
        "a/../b",
        "a/",
        "C:/x/.env",
      ]) {
        expect(apply([{ path, content }])).rejects.toBeInstanceOf(BadRequestError);
      }
      expect(repository.applyChanges).not.toHaveBeenCalled();
    });

    it("should reject executable files", async () => {
      expect(apply([{ path: "deploy/run.sh", content }])).rejects.toBeInstanceOf(BadRequestError);
    });

    it("should reject a change to an existing file without baseVersion", async () => {
      expect(apply([{ fileId, content }])).rejects.toBeInstanceOf(BadRequestError);
    });

    it("should reject a create without content", async () => {
      expect(apply([{ path: ".env" }])).rejects.toBeInstanceOf(BadRequestError);
    });

    it("should reject the same file or target path twice in one batch", async () => {
      expect(
        apply([
          { fileId, baseVersion: 1, content },
          { fileId, baseVersion: 1, delete: true },
        ]),
      ).rejects.toBeInstanceOf(BadRequestError);
      expect(
        apply([
          { path: ".env", content },
          { fileId: otherId, baseVersion: 3, path: ".env" },
        ]),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("should audit creates, moves and deletes with their paths", async () => {
      repository.applyChanges.mockResolvedValueOnce({
        files: [
          makeFile({ id: otherId, path: "new/.env" }),
          makeFile({ path: "apps/api/.env.dev", version: 2 }),
        ],
        deletedIds: ["33333333-3333-4333-8333-333333333333"],
        previousPaths: new Map([
          [fileId, "apps/api/.env"],
          ["33333333-3333-4333-8333-333333333333", "old/.env"],
        ]),
      });

      const result = await apply([{ path: "new/.env", content }]);

      expect(result.files.map((f) => f.path)).toEqual(["new/.env", "apps/api/.env.dev"]);
      const calls = audit.logMany.mock.calls[0]![0].map((entry) => [entry.action, entry.metadata]);
      expect(calls).toEqual([
        ["CREATE", { path: "new/.env" }],
        ["UPDATE", { path: "apps/api/.env.dev", previousPath: "apps/api/.env" }],
        ["DELETE", { path: "old/.env" }],
      ]);
    });
  });

  describe("listVersions", () => {
    it("should label each version with its own author", async () => {
      repository.listVersions.mockResolvedValueOnce([
        { version: 2, path: ".env", changedBy: "u2", message: "rotate key", createdAt: now },
        { version: 1, path: ".env", changedBy: "u1", message: null, createdAt: now },
      ]);
      repository.findUserNames.mockResolvedValueOnce([
        { id: "u1", firstName: "Ann", lastName: "Lee", email: "ann@x.io" },
      ]);

      const { items } = await service.listVersions(projectId, fileId);

      expect(items.map((v) => [v.version, v.changedBy.name, v.message])).toEqual([
        [2, "Deleted user", "rotate key"],
        [1, "Ann Lee", null],
      ]);
    });
  });
});
