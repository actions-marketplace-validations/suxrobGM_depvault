import { singleton } from "tsyringe";
import { BadRequestError, GoneError, NotFoundError } from "@/common/errors/http.error";
import { createRandomToken, hashPassword } from "@/common/utils/password";
import { PrismaClient, type ShareLink } from "@/generated/prisma";
import { AuditLogService } from "@/modules/audit-log";
import type { MessageResponse } from "@/types/response";
import type {
  AccessShareResponse,
  CreateShareBody,
  CreateShareResponse,
  ShareLinkInfoResponse,
  ShareLinkItemStatus,
  ShareLinkListResponse,
} from "./share-link.schema";

const SHARE_URL_BASE = process.env.FRONTEND_URL!;

/** Only PENDING and VIEWED are stored; a pending link past `expiresAt` reads as EXPIRED. */
function effectiveStatus(link: Pick<ShareLink, "status" | "expiresAt">): ShareLinkItemStatus {
  if (link.status === "PENDING" && link.expiresAt <= new Date()) return "EXPIRED";
  return link.status;
}

/** One-time, client-encrypted share links for files. The server never sees the decryption key. */
@singleton()
export class ShareLinkService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    projectId: string,
    userId: string,
    body: CreateShareBody,
    ipAddress = "unknown",
  ): Promise<CreateShareResponse> {
    const token = createRandomToken();
    const passwordHash = body.password ? await hashPassword(body.password) : null;
    const expiresAt = new Date(Date.now() + body.expiresIn * 1000);

    const shareLink = await this.prisma.shareLink.create({
      data: {
        creatorId: userId,
        projectId,
        token,
        encryptedPayload: body.encryptedPayload,
        iv: body.iv,
        authTag: body.authTag,
        passwordHash,
        fileName: body.fileName,
        mimeType: body.mimeType,
        expiresAt,
      },
    });

    await this.auditLogService.log({
      userId,
      projectId,
      action: "SHARE",
      resourceType: "SHARE_LINK",
      resourceId: shareLink.id,
      ipAddress,
      metadata: { fileName: body.fileName },
    });

    return { token, shareUrl: `${SHARE_URL_BASE}/s/${token}` };
  }

  async getInfo(token: string): Promise<ShareLinkInfoResponse> {
    const shareLink = await this.findConsumable(token);
    return {
      hasPassword: shareLink.passwordHash !== null,
      fileName: shareLink.fileName,
      mimeType: shareLink.mimeType,
      expiresAt: shareLink.expiresAt,
    };
  }

  async access(
    token: string,
    password?: string,
    ipAddress = "unknown",
  ): Promise<AccessShareResponse> {
    const shareLink = await this.findConsumable(token);
    await this.verifyPassword(shareLink, password);

    const response: AccessShareResponse = {
      encryptedPayload: shareLink.encryptedPayload,
      iv: shareLink.iv,
      authTag: shareLink.authTag,
      fileName: shareLink.fileName,
      mimeType: shareLink.mimeType,
    };

    // Conditional update: of two concurrent readers only one flips PENDING -> VIEWED and wins.
    const consumed = await this.consume(shareLink.id);
    if (!consumed) {
      throw new GoneError("This share link has already been accessed and is no longer available");
    }

    await this.auditLogService.log({
      projectId: shareLink.projectId,
      action: "READ",
      resourceType: "SHARE_LINK",
      resourceId: shareLink.id,
      ipAddress,
    });

    return response;
  }

  async list(projectId: string): Promise<ShareLinkListResponse> {
    const shareLinks = await this.prisma.shareLink.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });

    return {
      items: shareLinks.map((s) => ({
        id: s.id,
        token: s.token,
        status: effectiveStatus(s),
        hasPassword: s.passwordHash !== null,
        fileName: s.fileName,
        expiresAt: s.expiresAt,
        viewedAt: s.viewedAt,
        createdAt: s.createdAt,
      })),
    };
  }

  async revoke(
    projectId: string,
    shareId: string,
    userId: string,
    ipAddress = "unknown",
  ): Promise<MessageResponse> {
    const shareLink = await this.prisma.shareLink.findFirst({
      where: { id: shareId, projectId },
    });

    if (!shareLink) throw new NotFoundError("Share link not found");
    if (effectiveStatus(shareLink) !== "PENDING") {
      throw new BadRequestError("Only pending share links can be revoked");
    }

    await this.prisma.shareLink.delete({ where: { id: shareId } });

    await this.auditLogService.log({
      userId,
      projectId,
      action: "DELETE",
      resourceType: "SHARE_LINK",
      resourceId: shareId,
      ipAddress,
    });

    return { message: "Share link revoked" };
  }

  private async findConsumable(token: string) {
    const shareLink = await this.prisma.shareLink.findUnique({ where: { token } });

    if (!shareLink) throw new NotFoundError("Share link not found or already consumed");

    const status = effectiveStatus(shareLink);
    if (status === "VIEWED") {
      throw new GoneError("This share link has already been accessed and is no longer available");
    }
    if (status === "EXPIRED") {
      throw new GoneError("This share link has expired");
    }

    return shareLink;
  }

  private async verifyPassword(shareLink: Pick<ShareLink, "passwordHash">, password?: string) {
    if (!shareLink.passwordHash) return;

    if (!password) {
      throw new BadRequestError("This share link is password-protected");
    }

    const valid = await Bun.password.verify(password, shareLink.passwordHash);
    if (!valid) {
      throw new BadRequestError("Incorrect password");
    }
  }

  private async consume(shareId: string): Promise<boolean> {
    const { count } = await this.prisma.shareLink.updateMany({
      where: { id: shareId, status: "PENDING", expiresAt: { gt: new Date() } },
      data: {
        status: "VIEWED",
        viewedAt: new Date(),
        encryptedPayload: "",
        iv: "",
        authTag: "",
      },
    });
    return count === 1;
  }
}
