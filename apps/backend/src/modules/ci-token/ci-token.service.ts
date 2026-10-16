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
import { PlanEnforcementService } from "@/modules/subscription/plan-enforcement.service";
import type { MessageResponse, PaginatedResponse } from "@/types/response";
import type {
  CiFile,
  CiFileDownloadResponse,
  CiSecretsResponse,
  CiTokenCreatedResponse,
  CiTokenResponse,
  CreateCiTokenBody,
} from "./ci-token.schema";

const MAX_EXPIRY_SECONDS = 31536000; // 1 year
const BASE_ENVIRONMENT = "base";
/** Zero-knowledge split tokens (dvci_<auth>.<key>); version 1 rows predate the split and are rejected. */
const TOKEN_VERSION = 2;

@singleton()
export class CiTokenService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
    private readonly planEnforcement: PlanEnforcementService,
  ) {}

  /**
   * Register a client-generated CI token scoped to an app + environment. The client generates the
   * token, sends only the auth-part hash and the DEK wrapped under the key part — the server never
   * sees the token itself and cannot unwrap the DEK.
   */
  async create(
    projectId: string,
    userId: string,
    body: CreateCiTokenBody,
    ipAddress: string,
  ): Promise<CiTokenCreatedResponse> {
    await this.planEnforcement.enforceForProject(projectId, "ciToken");

    const app = await this.prisma.app.findFirst({
      where: { id: body.appId, projectId },
    });
    if (!app) {
      throw new NotFoundError("App not found in this project");
    }

    const ipAllowlist = body.ipAllowlist ?? [];

    if (ipAllowlist.length > 0) {
      const error = validateIpAllowlist(ipAllowlist);
      if (error) throw new BadRequestError(error);
    }

    if (body.expiresIn > MAX_EXPIRY_SECONDS) {
      throw new BadRequestError("Expiry cannot exceed 1 year");
    }

    const expiresAt = new Date(Date.now() + body.expiresIn * 1000);

    // tokenHash is a SHA-256 of 32 client-generated random bytes; the @unique column is the
    // sole backstop for the cryptographically-impossible collision — no pre-check needed.
    const ciToken = await this.prisma.ciToken.create({
      data: {
        projectId,
        appId: body.appId,
        environmentSlug: body.environmentSlug,
        createdBy: userId,
        name: body.name,
        tokenHash: body.tokenHash,
        tokenPrefix: body.tokenPrefix,
        tokenVersion: TOKEN_VERSION,
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
      metadata: { name: body.name, appName: app.name, environmentSlug: body.environmentSlug },
    });

    return {
      id: ciToken.id,
      tokenPrefix: ciToken.tokenPrefix,
      expiresAt,
    };
  }

  async list(projectId: string, page = 1, limit = 20): Promise<PaginatedResponse<CiTokenResponse>> {
    const where = { projectId };
    const [tokens, total] = await Promise.all([
      this.prisma.ciToken.findMany({
        where,
        include: {
          creator: { select: { email: true } },
          app: { select: { name: true } },
        },
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
      projectId: token.projectId,
      appId: token.appId,
      appName: token.app.name,
      environmentSlug: token.environmentSlug,
      ipAllowlist: token.ipAllowlist,
      expiresAt: token.expiresAt,
      lastUsedAt: token.lastUsedAt,
      createdAt: token.createdAt,
      createdByEmail: token.creator.email,
      tokenVersion: token.tokenVersion,
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
    const ciToken = await this.prisma.ciToken.findFirst({
      where: { id: tokenId, projectId },
    });

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
    // A dot means an old CLI sent the full split token, exposing the key part — reject before lookup.
    if (rawToken.includes(".")) {
      throw new UnauthorizedError(
        "CI token format not recognized. Upgrade the DepVault CLI, which sends only the token's auth part.",
      );
    }

    const tokenHash = hashToken(rawToken);

    const ciToken = await this.prisma.ciToken.findUnique({
      where: { tokenHash },
    });

    if (!ciToken) {
      throw new UnauthorizedError("Invalid CI token");
    }
    if (ciToken.tokenVersion < TOKEN_VERSION) {
      throw new UnauthorizedError(
        "This CI token predates the zero-knowledge token upgrade. Generate a new token in project settings.",
      );
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

  /**
   * Return base + token-environment file ciphertext for the token's app (config and secret).
   * Config files always carry an environment; secret files may be environment-neutral (null).
   */
  async fetchSecrets(
    ciToken: CiToken,
    pipelineRunId: string | null,
    clientIp: string,
  ): Promise<CiSecretsResponse> {
    const files = await this.prisma.repoFile.findMany({
      where: {
        appId: ciToken.appId,
        OR: [
          { environmentSlug: null },
          { environmentSlug: { in: [BASE_ENVIRONMENT, ciToken.environmentSlug] } },
        ],
      },
    });

    const fileList: CiFile[] = files.map((f) => ({
      id: f.id,
      kind: f.kind,
      relativePath: f.relativePath,
      environmentSlug: f.environmentSlug,
      format: f.format,
      mimeType: f.mimeType,
      encryptedContent: Buffer.from(f.encryptedContent).toString("base64"),
      iv: f.iv,
      authTag: f.authTag,
      isBinary: f.isBinary,
    }));

    await this.auditLogService.log({
      projectId: ciToken.projectId,
      action: "READ",
      resourceType: "CI_TOKEN",
      resourceId: ciToken.id,
      ipAddress: clientIp,
      metadata: { pipelineRunId: pipelineRunId ?? null, fileCount: fileList.length },
    });

    return {
      wrappedDek: ciToken.wrappedDek,
      wrappedDekIv: ciToken.wrappedDekIv,
      wrappedDekTag: ciToken.wrappedDekTag,
      files: fileList,
    };
  }

  async downloadFile(ciToken: CiToken, fileId: string): Promise<CiFileDownloadResponse> {
    const file = await this.prisma.repoFile.findFirst({
      where: { id: fileId, appId: ciToken.appId },
    });

    if (!file) {
      throw new NotFoundError("File not found");
    }

    return {
      encryptedContent: Buffer.from(file.encryptedContent).toString("base64"),
      iv: file.iv,
      authTag: file.authTag,
      relativePath: file.relativePath,
      mimeType: file.mimeType ?? "application/octet-stream",
    };
  }
}
