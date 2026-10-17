import { singleton } from "tsyringe";
import { logger } from "@/common/logger/logger";
import {
  type AuditAction,
  type AuditResourceType,
  type Prisma,
  PrismaClient,
} from "@/generated/prisma";
import { paginate, toPage } from "@/types/pagination";
import type { PaginatedResponse } from "@/types/response";
import type { GlobalAuditLogResponse } from "./audit-log.schema";

export interface CreateAuditLogParams {
  userId?: string;
  projectId: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string;
  ipAddress: string;
  metadata?: Record<string, string | number | boolean | null>;
}

interface AuditLogFilters {
  action?: AuditAction;
  resourceType?: AuditResourceType;
  from?: string;
  to?: string;
  userEmail?: string;
}

const AUDIT_LOG_INCLUDE = {
  user: { select: { email: true, firstName: true, lastName: true, avatarUrl: true } },
  project: { select: { name: true } },
} as const;

type AuditLogRow = Prisma.AuditLogGetPayload<{ include: typeof AUDIT_LOG_INCLUDE }>;

const toResponse = (log: AuditLogRow): GlobalAuditLogResponse => ({
  id: log.id,
  userId: log.userId,
  projectId: log.projectId,
  action: log.action,
  resourceType: log.resourceType,
  resourceId: log.resourceId,
  ipAddress: log.ipAddress,
  metadata: log.metadata as Record<string, unknown> | null,
  createdAt: log.createdAt,
  userEmail: log.user?.email ?? null,
  userFirstName: log.user?.firstName ?? null,
  userLastName: log.user?.lastName ?? null,
  userAvatarUrl: log.user?.avatarUrl ?? null,
  projectName: log.project.name,
});

@singleton()
export class AuditLogService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Writes one entry; failures are logged rather than failing the audited action. */
  async log(params: CreateAuditLogParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: params });
    } catch (error) {
      logger.error({ error, action: params.action }, "Failed to write audit log");
    }
  }

  /** Write several entries in one insert (bulk downloads and batch changes). */
  async logMany(entries: CreateAuditLogParams[]): Promise<void> {
    if (entries.length === 0) return;
    try {
      await this.prisma.auditLog.createMany({ data: entries });
    } catch (error) {
      logger.error({ error, action: entries[0]!.action }, "Failed to write audit logs");
    }
  }

  /** Audit log of one project (callers must already hold EDITOR+). */
  async list(
    projectId: string,
    filters: AuditLogFilters,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResponse<GlobalAuditLogResponse>> {
    return this.findPage({ projectId }, filters, page, limit);
  }

  /** Audit logs across the projects where the user may read the audit log (OWNER or EDITOR). */
  async listGlobal(
    userId: string,
    filters: AuditLogFilters,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResponse<GlobalAuditLogResponse>> {
    const scope: Prisma.AuditLogWhereInput = {
      project: { members: { some: { userId, role: { in: ["OWNER", "EDITOR"] } } } },
    };
    return this.findPage(scope, filters, page, limit);
  }

  private async findPage(
    scope: Prisma.AuditLogWhereInput,
    filters: AuditLogFilters,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<GlobalAuditLogResponse>> {
    const where: Prisma.AuditLogWhereInput = {
      ...scope,
      ...(filters.action && { action: filters.action }),
      ...(filters.resourceType && { resourceType: filters.resourceType }),
      ...((filters.from || filters.to) && {
        createdAt: {
          ...(filters.from && { gte: new Date(filters.from) }),
          ...(filters.to && { lte: new Date(filters.to) }),
        },
      }),
      ...(filters.userEmail && {
        user: { email: { contains: filters.userEmail, mode: "insensitive" } },
      }),
    };

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: AUDIT_LOG_INCLUDE,
        ...paginate(page, limit),
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return toPage(logs.map(toResponse), total, page, limit);
  }
}
