import { inject, injectable } from "@needle-di/core";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/common/errors/http.error";
import { PrismaClient } from "@/generated/prisma";
import { AuditLogService } from "@/modules/audit-log";
import { NotificationService } from "@/modules/notification/notification.service";
import { PlanEnforcementService } from "@/modules/subscription/plan-enforcement.service";
import { paginate, toPage } from "@/types/pagination";
import type { PaginatedResponse } from "@/types/response";
import type { MemberResponse, TransferOwnershipBody, UpdateMemberRoleBody } from "./member.schema";

const MEMBER_INCLUDE = {
  user: { select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true } },
} as const;

/** Who performed a member-management action, for the audit trail. */
interface Actor {
  userId: string;
  ipAddress: string;
}

@injectable()
export class MemberService {
  constructor(
    private readonly prisma = inject(PrismaClient),
    private readonly notificationService = inject(NotificationService),
    private readonly planEnforcement = inject(PlanEnforcementService),
    private readonly auditLogService = inject(AuditLogService),
  ) {}

  async list(
    projectId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<MemberResponse>> {
    const where = { projectId };

    const [members, total] = await Promise.all([
      this.prisma.projectMember.findMany({
        where,
        include: MEMBER_INCLUDE,
        ...paginate(page, limit),
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.projectMember.count({ where }),
    ]);

    return toPage(members, total, page, limit);
  }

  async updateRole(
    projectId: string,
    memberId: string,
    body: UpdateMemberRoleBody,
    actor: Actor,
  ): Promise<MemberResponse> {
    const target = await this.findMember(projectId, memberId);

    if (target.role === "OWNER") {
      throw new ForbiddenError("Cannot change the owner's role");
    }

    const updated = await this.prisma.projectMember.update({
      where: { id: memberId },
      data: { role: body.role },
      include: MEMBER_INCLUDE,
    });

    void this.notificationService.notify({
      type: "ROLE_CHANGE",
      userId: target.userId,
      projectId,
      oldRole: target.role,
      newRole: body.role,
    });

    await this.auditLogService.log({
      userId: actor.userId,
      projectId,
      action: "UPDATE",
      resourceType: "PROJECT_MEMBER",
      resourceId: target.userId,
      ipAddress: actor.ipAddress,
      metadata: { oldRole: target.role, newRole: body.role },
    });

    return updated;
  }

  async remove(projectId: string, memberId: string, actor: Actor): Promise<{ message: string }> {
    const target = await this.findMember(projectId, memberId);

    if (target.role === "OWNER") {
      throw new ForbiddenError("Cannot remove the project owner");
    }

    // Revoke everything that still gives the ex-member access: wrapped DEKs and their CI tokens.
    await this.prisma.$transaction([
      this.prisma.projectKeyGrant.deleteMany({ where: { projectId, userId: target.userId } }),
      this.prisma.ciToken.deleteMany({ where: { projectId, createdBy: target.userId } }),
      this.prisma.projectMember.delete({ where: { id: memberId } }),
    ]);

    void this.notificationService.notify({
      type: "MEMBER_REMOVED",
      userId: target.userId,
      projectId,
    });

    await this.auditLogService.log({
      userId: actor.userId,
      projectId,
      action: "DELETE",
      resourceType: "PROJECT_MEMBER",
      resourceId: target.userId,
      ipAddress: actor.ipAddress,
      metadata: { role: target.role },
    });

    return { message: "Member removed successfully" };
  }

  /** Hands the OWNER role to another member; the caller becomes an EDITOR. */
  async transferOwnership(
    projectId: string,
    body: TransferOwnershipBody,
    callerMemberId: string,
    actor: Actor,
  ): Promise<{ message: string }> {
    if (body.newOwnerId === actor.userId) {
      throw new BadRequestError("You are already the owner");
    }

    const newOwnerMember = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: body.newOwnerId } },
    });

    if (!newOwnerMember) {
      throw new NotFoundError("Target user is not a member of this project");
    }

    // The project's usage moves to the new owner's plan, starting with the project itself.
    await this.planEnforcement.enforce(body.newOwnerId, "project");

    await this.prisma.$transaction([
      this.prisma.projectMember.update({
        where: { id: newOwnerMember.id },
        data: { role: "OWNER" },
      }),
      this.prisma.projectMember.update({
        where: { id: callerMemberId },
        data: { role: "EDITOR" },
      }),
    ]);

    await this.auditLogService.log({
      userId: actor.userId,
      projectId,
      action: "UPDATE",
      resourceType: "PROJECT",
      resourceId: projectId,
      ipAddress: actor.ipAddress,
      metadata: { newOwnerId: body.newOwnerId },
    });

    return { message: "Ownership transferred successfully" };
  }

  private async findMember(projectId: string, memberId: string) {
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId },
    });

    if (!member) {
      throw new NotFoundError("Member not found");
    }

    return member;
  }
}
