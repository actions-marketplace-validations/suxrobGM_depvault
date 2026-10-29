import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { BadRequestError, GoneError, NotFoundError } from "@/common/errors/http.error";
import * as password from "@/common/utils/password";
import type { PrismaClient } from "@/generated/prisma";
import type { AuditLogService } from "@/modules/audit-log/audit-log.service";
import type { DeepMockProxy } from "@/types/deep-mock";
import { ShareLinkService } from "./share-link.service";

const now = new Date();
const futureDate = new Date(Date.now() + 86400 * 1000);
const pastDate = new Date(Date.now() - 1000);

const projectId = "project-uuid";
const userId = "user-uuid";
const shareId = "share-uuid";
const token = "abc123token";

function makeShareLink(overrides: Record<string, unknown> = {}) {
  return {
    id: shareId,
    token,
    projectId,
    creatorId: userId,
    encryptedPayload: "cipher",
    iv: "iv-val",
    authTag: "tag-val",
    passwordHash: null,
    fileName: null,
    mimeType: null,
    status: "PENDING",
    expiresAt: futureDate,
    viewedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createMockPrisma() {
  return {
    shareLink: {
      create: mock(() => Promise.resolve(makeShareLink())),
      findUnique: mock(() => Promise.resolve(null)),
      findFirst: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      update: mock(() => Promise.resolve(makeShareLink())),
      updateMany: mock(() => Promise.resolve({ count: 0 })),
      delete: mock(() => Promise.resolve(makeShareLink())),
    },
  } as unknown as DeepMockProxy<PrismaClient>;
}

function createMockAuditLogService() {
  return { log: mock(() => Promise.resolve()) } as unknown as AuditLogService;
}

describe("ShareLinkService", () => {
  let service: ShareLinkService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockAuditLog: ReturnType<typeof createMockAuditLogService>;

  beforeEach(() => {
    mock.restore();
    mockPrisma = createMockPrisma();
    mockAuditLog = createMockAuditLogService();
    service = new ShareLinkService(mockPrisma, mockAuditLog);

    spyOn(password, "createRandomToken").mockReturnValue(token);
    spyOn(password, "hashPassword").mockResolvedValue("hashed-password");
  });

  describe("create", () => {
    const body = {
      encryptedPayload: "encrypted",
      iv: "iv",
      authTag: "tag",
      fileName: "config.json",
      mimeType: "application/json",
      expiresIn: 3600,
    };

    it("should create a share link for a file", async () => {
      mockPrisma.shareLink.create.mockResolvedValueOnce(
        makeShareLink({ fileName: "config.json", mimeType: "application/json" }),
      );

      const result = await service.create(projectId, userId, body, "127.0.0.1");

      expect(result.shareUrl).toContain(`/s/${token}`);
      expect(mockPrisma.shareLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fileName: "config.json",
            mimeType: "application/json",
          }),
        }),
      );
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "SHARE", resourceType: "SHARE_LINK" }),
      );
    });

    it("should hash password when provided", async () => {
      await service.create(projectId, userId, { ...body, password: "s3cr3t" }, "127.0.0.1");

      expect(password.hashPassword).toHaveBeenCalledWith("s3cr3t");
      expect(mockPrisma.shareLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ passwordHash: "hashed-password" }),
        }),
      );
    });
  });

  describe("getInfo", () => {
    it.each([
      [null, false],
      ["hashed", true],
    ])("should return metadata (passwordHash %p -> hasPassword %p)", async (hash, hasPassword) => {
      mockPrisma.shareLink.findUnique.mockResolvedValueOnce(makeShareLink({ passwordHash: hash }));

      const info = await service.getInfo(token);

      expect(info).toMatchObject({ hasPassword, expiresAt: futureDate });
    });

    it.each([
      ["NotFoundError when the token does not exist", null, NotFoundError],
      ["GoneError when already viewed", makeShareLink({ status: "VIEWED" }), GoneError],
    ])("should throw %s", async (_, stored, error) => {
      mockPrisma.shareLink.findUnique.mockResolvedValueOnce(stored);

      expect(service.getInfo(token)).rejects.toBeInstanceOf(error);
    });

    it("should throw GoneError past expiresAt without writing (GET is side-effect free)", async () => {
      mockPrisma.shareLink.findUnique.mockResolvedValueOnce(makeShareLink({ expiresAt: pastDate }));

      await expect(service.getInfo(token)).rejects.toBeInstanceOf(GoneError);

      expect(mockPrisma.shareLink.update).not.toHaveBeenCalled();
      expect(mockPrisma.shareLink.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("access", () => {
    it("should return encrypted payload and consume the share link", async () => {
      mockPrisma.shareLink.findUnique.mockResolvedValueOnce(makeShareLink());
      mockPrisma.shareLink.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.access(token, undefined, "1.2.3.4");

      expect(result.encryptedPayload).toBe("cipher");
      expect(mockPrisma.shareLink.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: shareId, status: "PENDING" }),
          data: expect.objectContaining({
            status: "VIEWED",
            encryptedPayload: "",
            iv: "",
            authTag: "",
          }),
        }),
      );
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "READ", resourceType: "SHARE_LINK" }),
      );
    });

    it("should reject the second of two concurrent reads", async () => {
      mockPrisma.shareLink.findUnique.mockResolvedValueOnce(makeShareLink());
      mockPrisma.shareLink.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.access(token)).rejects.toBeInstanceOf(GoneError);
      expect(mockAuditLog.log).not.toHaveBeenCalled();
    });

    it("should verify correct password", async () => {
      spyOn(Bun.password, "verify").mockResolvedValueOnce(true);
      mockPrisma.shareLink.findUnique.mockResolvedValueOnce(
        makeShareLink({ passwordHash: "hashed" }),
      );
      mockPrisma.shareLink.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.access(token, "correct-password");

      expect(result.encryptedPayload).toBe("cipher");
    });

    it.each([
      ["missing", undefined],
      ["wrong", "wrong-password"],
    ])("should throw BadRequestError when the password is %s", async (_, given) => {
      spyOn(Bun.password, "verify").mockResolvedValueOnce(false);
      mockPrisma.shareLink.findUnique.mockResolvedValueOnce(
        makeShareLink({ passwordHash: "hashed" }),
      );

      expect(service.access(token, given)).rejects.toBeInstanceOf(BadRequestError);
    });

    it("should throw NotFoundError for unknown token", async () => {
      mockPrisma.shareLink.findUnique.mockResolvedValueOnce(null);

      expect(service.access("unknown-token")).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("list", () => {
    it("should report lapsed PENDING links as EXPIRED without writing", async () => {
      mockPrisma.shareLink.findMany.mockResolvedValueOnce([
        makeShareLink(),
        makeShareLink({ expiresAt: new Date(Date.now() - 1000) }),
      ]);

      const result = await service.list(projectId);

      expect(mockPrisma.shareLink.updateMany).not.toHaveBeenCalled();
      expect(result.items.map((s) => s.status)).toEqual(["PENDING", "EXPIRED"]);
      expect(result.items[0]!.token).toBe(token);
    });
  });

  describe("revoke", () => {
    it("should delete a PENDING share link and log the audit event", async () => {
      mockPrisma.shareLink.findFirst.mockResolvedValueOnce(makeShareLink());

      const result = await service.revoke(projectId, shareId, userId, "1.2.3.4");

      expect(result.message).toBe("Share link revoked");
      expect(mockPrisma.shareLink.delete).toHaveBeenCalledWith({ where: { id: shareId } });
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "DELETE", resourceType: "SHARE_LINK" }),
      );
    });

    it("should throw BadRequestError when trying to revoke a non-PENDING share link", async () => {
      mockPrisma.shareLink.findFirst.mockResolvedValueOnce(makeShareLink({ status: "VIEWED" }));

      expect(service.revoke(projectId, shareId, userId)).rejects.toBeInstanceOf(BadRequestError);
    });

    it("should throw NotFoundError when share link does not exist", async () => {
      mockPrisma.shareLink.findFirst.mockResolvedValueOnce(null);

      expect(service.revoke(projectId, shareId, userId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
