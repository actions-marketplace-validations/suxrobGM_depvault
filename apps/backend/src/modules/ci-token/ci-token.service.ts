import { singleton } from "tsyringe";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/common/errors/http.error";
import { isIpInAllowlist, validateIpAllowlist } from "@/common/utils/ip";
import { hashToken } from "@/common/utils/password";
import { type CiToken, PrismaClient } from "@/generated/prisma";
import { AuditLogService } from "@/modules/audit-log";
import { RepoFileRepository } from "@/modules/repo-file/repo-file.repository";
import { PlanEnforcementService } from "@/modules/subscription/plan-enforcement.service";
import type { MessageResponse, PaginatedResponse } from "@/types/response";
import type {
  CiFilesResponse,
  CiTokenCreatedResponse,
  CiTokenResponse,
  CreateCiTokenBody,
} from "./ci-token.schema";

@singleton()
export class CiTokenService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
    private readonly planEnforcement: PlanEnforcementService,
    private readonly repoFiles: RepoFileRepository,
  ) {}

  /**
   * Register a client-generated CI token, optionally limited to path globs. Only the auth-part
   * hash and the DEK wrapped under the key part are received, so the server can never unwrap it.
   */
  async create(
    projectId: string,
    userId: string,
    body: CreateCiTokenBody,
    ipAddress: string,
  ): Promise<CiTokenCreatedResponse> {
    await this.planEnforcement.enforceForProject(projectId, "ciToken");

    const paths = [...new Set(body.paths ?? [])];
    for (const glob of paths) {
      if (glob.includes("\\") || glob.startsWith("/")) {
        throw new BadRequestError(`Invalid path "${glob}": use repo-relative forward-slash paths`);
      }
    }

    const ipAllowlist = body.ipAllowlist ?? [];
    if (ipAllowlist.length > 0) {
      await this.planEnforcement.enforceFeatureForProject(projectId, "ipAllowlists");
      const error = validateIpAllowlist(ipAllowlist);
      if (error) throw new BadRequestError(error);
    }

    const expiresAt = new Date(Date.now() + body.expiresIn * 1000);

    // tokenHash covers 32 random bytes, so a collision is infeasible; @unique is the only backstop.
    const ciToken = await this.prisma.ciToken.create({
      data: {
        projectId,
        createdBy: userId,
        name: body.name,
        tokenHash: body.tokenHash,
        tokenPrefix: body.tokenPrefix,
        paths,
        ipAllowlist,
        expiresAt,
        wrappedDek: body.wrappedDek,
        wrappedDekIv: body.wrappedDekIv,
        wrappedDekTag: body.wrappedDekTag,
      },
    });

    await this.auditLogService.log({
      userId,
      projectId,
      action: "CREATE",
      resourceType: "CI_TOKEN",
      resourceId: ciToken.id,
      ipAddress,
      metadata: { name: body.name, paths: paths.join(", ") || "*" },
    });

    return { id: ciToken.id, tokenPrefix: ciToken.tokenPrefix, expiresAt };
  }

  async list(projectId: string, page = 1, limit = 20): Promise<PaginatedResponse<CiTokenResponse>> {
    const where = { projectId };
    const [tokens, total] = await Promise.all([
      this.prisma.ciToken.findMany({
        where,
        include: { creator: { select: { email: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.ciToken.count({ where }),
    ]);

    const items: CiTokenResponse[] = tokens.map((token) => ({
      id: token.id,
      name: token.name,
      tokenPrefix: token.tokenPrefix,
      paths: token.paths,
      ipAllowlist: token.ipAllowlist,
      expiresAt: token.expiresAt,
      lastUsedAt: token.lastUsedAt,
      createdAt: token.createdAt,
      createdByEmail: token.creator.email,
    }));

    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async revoke(
    projectId: string,
    tokenId: string,
    userId: string,
    ipAddress: string,
  ): Promise<MessageResponse> {
    const ciToken = await this.prisma.ciToken.findFirst({ where: { id: tokenId, projectId } });
    if (!ciToken) {
      throw new NotFoundError("CI token not found");
    }

    await this.prisma.ciToken.delete({ where: { id: tokenId } });

    await this.auditLogService.log({
      userId,
      projectId,
      action: "DELETE",
      resourceType: "CI_TOKEN",
      resourceId: tokenId,
      ipAddress,
      metadata: { name: ciToken.name },
    });

    return { message: "CI token deleted" };
  }

  async validateToken(rawToken: string, clientIp: string): Promise<CiToken> {
    // A dot means the whole split token was sent, leaking the key part; reject pre-lookup.
    if (rawToken.includes(".")) {
      throw new UnauthorizedError(
        "CI token format not recognized. Upgrade the DepVault CLI, which sends only the token's auth part.",
      );
    }

    const ciToken = await this.prisma.ciToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });

    if (!ciToken) {
      throw new UnauthorizedError("Invalid CI token");
    }
    if (ciToken.expiresAt < new Date()) {
      throw new UnauthorizedError("CI token has expired");
    }
    if (ciToken.ipAllowlist.length > 0 && !isIpInAllowlist(clientIp, ciToken.ipAllowlist)) {
      throw new ForbiddenError("IP address not in allowlist");
    }

    await this.prisma.ciToken.update({
      where: { id: ciToken.id },
      data: { lastUsedAt: new Date() },
    });

    return ciToken;
  }

  /** Return the wrapped DEK plus the ciphertext of every file the token's path globs allow. */
  async fetchFiles(
    ciToken: CiToken,
    pipelineRunId: string | null,
    clientIp: string,
  ): Promise<CiFilesResponse> {
    const globs = ciToken.paths.map((pattern) => new Bun.Glob(pattern));
    const allowedIds =
      globs.length === 0
        ? undefined
        : (await this.repoFiles.list(ciToken.projectId))
            .filter((f) => globs.some((g) => g.match(f.path)))
            .map((f) => f.id);
    const files =
      allowedIds?.length === 0 ? [] : await this.repoFiles.findMany(ciToken.projectId, allowedIds);

    await this.auditLogService.log({
      projectId: ciToken.projectId,
      action: "READ",
      resourceType: "CI_TOKEN",
      resourceId: ciToken.id,
      ipAddress: clientIp,
      metadata: { pipelineRunId, fileCount: files.length },
    });

    return {
      wrappedDek: ciToken.wrappedDek,
      wrappedDekIv: ciToken.wrappedDekIv,
      wrappedDekTag: ciToken.wrappedDekTag,
      files: files.map((f) => ({
        id: f.id,
        path: f.path,
        encryptedContent: Buffer.from(f.encryptedContent).toString("base64"),
        iv: f.iv,
        authTag: f.authTag,
        isBinary: f.isBinary,
      })),
    };
  }
}
