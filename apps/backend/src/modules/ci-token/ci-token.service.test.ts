import "reflect-metadata";
import { beforeEach, describe, expect, it } from "bun:test";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/common/errors/http.error";
import { baseCiToken, createCiTokenService } from "./ci-token.test-helpers";

describe("CiTokenService", () => {
  let ctx: ReturnType<typeof createCiTokenService>;

  beforeEach(() => {
    ctx = createCiTokenService();
  });

  describe("create", () => {
    const body = {
      name: "GitHub Actions Prod",
      paths: ["deploy/**", "deploy/**"],
      tokenHash: "a".repeat(64),
      tokenPrefix: "abcd1234",
      wrappedDek: "wrapped-dek",
      wrappedDekIv: "wrapped-iv",
      wrappedDekTag: "wrapped-tag",
      expiresIn: 86400,
    };

    it("should store client-sent fields verbatim and dedupe paths without returning the token", async () => {
      const result = await ctx.service.create("project-uuid", "user-uuid", body, "127.0.0.1");

      expect(result).not.toHaveProperty("token");
      expect(result.tokenPrefix).toHaveLength(8);
      expect(ctx.prisma.ciToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tokenHash: body.tokenHash,
            tokenPrefix: body.tokenPrefix,
            paths: ["deploy/**"],
            wrappedDek: "wrapped-dek",
            wrappedDekIv: "wrapped-iv",
            wrappedDekTag: "wrapped-tag",
          }),
        }),
      );
      expect(ctx.planEnforcement.enforceForProject).toHaveBeenCalledWith("project-uuid", "ciToken");
      expect(ctx.audit.log).toHaveBeenCalled();
    });

    it.each([
      ["a path glob is not repo-relative", { paths: ["/etc/**"] }],
      ["an IP allowlist entry is invalid", { ipAllowlist: ["not-an-ip"] }],
    ])("should throw BadRequestError when %s", async (_, overrides) => {
      expect(
        ctx.service.create("project-uuid", "user-uuid", { ...body, ...overrides }, "127.0.0.1"),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("should require the ipAllowlists plan feature when an allowlist is set", async () => {
      await ctx.service.create(
        "project-uuid",
        "user-uuid",
        { ...body, ipAllowlist: ["10.0.0.0/8"] },
        "127.0.0.1",
      );

      expect(ctx.planEnforcement.enforceFeatureForProject).toHaveBeenCalledWith(
        "project-uuid",
        "ipAllowlists",
      );
    });
  });

  describe("list", () => {
    it("should return a paginated token list with path scopes and creator email", async () => {
      ctx.prisma.ciToken.findMany.mockResolvedValueOnce([
        { ...baseCiToken, paths: ["deploy/**"], creator: { email: "user@test.com" } },
      ]);
      ctx.prisma.ciToken.count.mockResolvedValueOnce(1);

      const result = await ctx.service.list("project-uuid");

      expect(result.items[0]).toMatchObject({
        paths: ["deploy/**"],
        createdByEmail: "user@test.com",
      });
      expect(result.pagination.total).toBe(1);
    });
  });

  describe("revoke", () => {
    it("should delete the token and audit it", async () => {
      const result = await ctx.service.revoke(
        "project-uuid",
        "token-uuid",
        "user-uuid",
        "127.0.0.1",
      );

      expect(result.message).toBe("CI token deleted");
      expect(ctx.prisma.ciToken.delete).toHaveBeenCalled();
      expect(ctx.audit.log).toHaveBeenCalled();
    });

    it("should throw NotFoundError when token not found", async () => {
      ctx.prisma.ciToken.findFirst.mockResolvedValueOnce(null);

      expect(
        ctx.service.revoke("project-uuid", "token-uuid", "user-uuid", "127.0.0.1"),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("validateToken", () => {
    it("should return the token and record its use", async () => {
      const result = await ctx.service.validateToken("dvci_sometoken", "127.0.0.1");

      expect(result.id).toBe("token-uuid");
      expect(ctx.prisma.ciToken.update).toHaveBeenCalled();
    });

    it.each([
      ["unknown", null],
      ["expired", { ...baseCiToken, expiresAt: new Date(Date.now() - 1000) }],
    ])("should throw UnauthorizedError when the token is %s", async (_, stored) => {
      ctx.prisma.ciToken.findUnique.mockResolvedValueOnce(stored);

      expect(ctx.service.validateToken("dvci_token", "127.0.0.1")).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it("should reject a full split token (old CLI sent the key part)", async () => {
      expect(ctx.service.validateToken("dvci_auth.keypart", "127.0.0.1")).rejects.toThrow(
        /Upgrade the DepVault CLI/,
      );
      expect(ctx.prisma.ciToken.findUnique).not.toHaveBeenCalled();
    });

    it("should throw ForbiddenError when the IP is not in the allowlist", async () => {
      ctx.prisma.ciToken.findUnique.mockResolvedValueOnce({
        ...baseCiToken,
        ipAllowlist: ["10.0.0.1"],
      });

      expect(ctx.service.validateToken("dvci_token", "192.168.1.1")).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });

    it("should allow an IP inside an allowlisted CIDR", async () => {
      ctx.prisma.ciToken.findUnique.mockResolvedValueOnce({
        ...baseCiToken,
        ipAllowlist: ["10.0.0.0/8"],
      });

      const result = await ctx.service.validateToken("dvci_token", "10.1.2.3");

      expect(result.id).toBe("token-uuid");
    });
  });
});
