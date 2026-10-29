import { displayName } from "@depvault/shared/utils";
import { inject, injectable } from "@needle-di/core";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/common/errors/http.error";
import { logger } from "@/common/logger/logger";
import { type InvitationStatus, type Prisma, PrismaClient } from "@/generated/prisma";
import { AuditLogService } from "@/modules/audit-log/audit-log.service";
import { NotificationService } from "@/modules/notification/notification.service";
import { PlanEnforcementService } from "@/modules/subscription/plan-enforcement.service";
import { paginate, toPage } from "@/types/pagination";
import type { PaginatedResponse } from "@/types/response";
import type { CreateInvitationBody, InvitationResponse } from "./invitation.schema";
import { InvitationEmailService } from "./invitation-email.service";

const INVITATION_EXPIRY_DAYS = 7;

const INVITATION_INCLUDE = {
  invitedBy: { select: { firstName: true, lastName: true } },
  project: { select: { id: true, name: true } },
} as const;

type InvitationRow = Prisma.ProjectInvitationGetPayload<{ include: typeof INVITATION_INCLUDE }>;

@injectable()
export class InvitationService {
  constructor(
    private readonly prisma = inject(PrismaClient),
    private readonly invitationEmail = inject(InvitationEmailService),
    private readonly notificationService = inject(NotificationService),
    private readonly planEnforcement = inject(PlanEnforcementService),
    private readonly auditLogService = inject(AuditLogService),
  ) {}

  async create(
    projectId: string,
    body: CreateInvitationBody,
    actorId: string,
    ipAddress: string,
  ): Promise<InvitationResponse> {
    await this.planEnforcement.enforceForProject(projectId, "member");

    const email = body.email.toLowerCase();
    const [inviter, invitee] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: actorId },
        select: { email: true, firstName: true, lastName: true },
      }),
      this.prisma.user.findUnique({ where: { email }, select: { id: true } }),
    ]);

    if (inviter?.email.toLowerCase() === email) {
      throw new BadRequestError("Cannot invite yourself");
    }

    await Promise.all([
      this.ensureNotMember(projectId, email),
      this.ensureNoPendingInvite(projectId, email),
    ]);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

    const invitation = await this.prisma.projectInvitation.create({
      data: {
        projectId,
        email,
        role: body.role,
        invitedById: actorId,
        userId: invitee?.id ?? null,
        expiresAt,
      },
      include: INVITATION_INCLUDE,
    });

    const inviterName = inviter ? displayName(inviter) : "A team member";
    this.invitationEmail.send({
      email,
      inviterName,
      projectName: invitation.project.name,
      role: body.role,
      token: invitation.token,
      isExistingUser: !!invitee,
    });

    if (invitee) {
      void this.notificationService.notify({
        type: "INVITATION_RECEIVED",
        userId: invitee.id,
        projectId,
        inviterName,
        token: invitation.token,
      });
    }

    await this.auditLogService.log({
      userId: actorId,
      projectId,
      action: "CREATE",
      resourceType: "INVITATION",
      resourceId: invitation.id,
      ipAddress,
      metadata: { email, role: body.role },
    });

    return invitation;
  }

  async listByProject(
    projectId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<InvitationResponse>> {
    return this.listPending({ projectId }, page, limit);
  }

  async listForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<InvitationResponse>> {
    return this.listPending({ userId }, page, limit);
  }

  /** Returns minimal invitation info for the register form (no auth required). */
  async getByToken(token: string): Promise<{ email: string; projectName: string }> {
    const invitation = await this.findPending({ token });
    return { email: invitation.email, projectName: invitation.project.name };
  }

  async resend(
    projectId: string,
    invitationId: string,
    actorId: string,
  ): Promise<{ message: string }> {
    const invitation = await this.findPending({ id: invitationId, projectId });
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { firstName: true, lastName: true },
    });

    this.invitationEmail.send(
      {
        email: invitation.email,
        inviterName: actor ? displayName(actor) : "A team member",
        projectName: invitation.project.name,
        role: invitation.role,
        token: invitation.token,
        isExistingUser: !!invitation.userId,
      },
      true,
    );

    return { message: "Invitation resent" };
  }

  async cancel(
    projectId: string,
    invitationId: string,
    actorId: string,
    ipAddress: string,
  ): Promise<{ message: string }> {
    const invitation = await this.findPending(
      { id: invitationId, projectId },
      { allowExpired: true },
    );

    await this.prisma.$transaction(this.transitionStatus(invitation, "CANCELLED"));

    await this.auditLogService.log({
      userId: actorId,
      projectId,
      action: "DELETE",
      resourceType: "INVITATION",
      resourceId: invitation.id,
      ipAddress,
      metadata: { email: invitation.email },
    });

    return { message: "Invitation cancelled" };
  }

  /** Accepts an invitation by token during registration (skips recipient check). */
  async acceptByToken(token: string, userId: string): Promise<void> {
    try {
      const invitation = await this.findPending({ token });
      await this.acceptInvitation(invitation, userId);
    } catch (error) {
      logger.error({ error, token }, "Failed to auto-accept invitation during registration");
    }
  }

  async accept(token: string, userId: string): Promise<{ message: string }> {
    const invitation = await this.findPending({ token });
    await this.verifyRecipient(invitation.email, userId);
    return this.acceptInvitation(invitation, userId);
  }

  async decline(token: string, userId: string): Promise<{ message: string }> {
    const invitation = await this.findPending({ token });
    await this.verifyRecipient(invitation.email, userId);

    await this.prisma.$transaction(this.transitionStatus(invitation, "DECLINED", userId));

    return { message: "Invitation declined" };
  }

  /** Links pending invitations to a newly registered user and creates notifications. */
  async linkPendingInvitations(email: string, userId: string): Promise<void> {
    try {
      const pendingInvitations = await this.prisma.projectInvitation.findMany({
        where: {
          email: email.toLowerCase(),
          status: "PENDING",
          userId: null,
          expiresAt: { gt: new Date() },
        },
        include: INVITATION_INCLUDE,
      });

      if (pendingInvitations.length === 0) return;

      await this.prisma.projectInvitation.updateMany({
        where: { id: { in: pendingInvitations.map((i) => i.id) } },
        data: { userId },
      });

      for (const invitation of pendingInvitations) {
        void this.notificationService.notify({
          type: "INVITATION_RECEIVED",
          userId,
          projectId: invitation.projectId,
          inviterName: displayName(invitation.invitedBy),
          token: invitation.token,
        });
      }
    } catch (error) {
      logger.error({ error, email }, "Failed to link pending invitations");
    }
  }

  private async acceptInvitation(
    invitation: InvitationRow,
    userId: string,
  ): Promise<{ message: string }> {
    const existingMember = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: invitation.projectId, userId } },
    });

    if (existingMember) {
      await this.prisma.$transaction(this.transitionStatus(invitation, "ACCEPTED"));
      return { message: "You are already a member of this project" };
    }

    // The pending invite already holds a seat; this catches a downgrade since it was sent.
    await this.planEnforcement.enforceForProject(invitation.projectId, "member", 0);

    await this.prisma.$transaction([
      ...this.transitionStatus(invitation, "ACCEPTED", userId),
      this.prisma.projectMember.create({
        data: { projectId: invitation.projectId, userId, role: invitation.role },
      }),
    ]);

    return { message: "Invitation accepted" };
  }

  /**
   * Moves an invitation to `status`. `(projectId, email, status)` is unique, so an older row
   * already in that status is dropped first.
   */
  private transitionStatus(
    invitation: { id: string; projectId: string; email: string },
    status: Exclude<InvitationStatus, "PENDING">,
    userId?: string,
  ): Prisma.PrismaPromise<unknown>[] {
    return [
      this.prisma.projectInvitation.deleteMany({
        where: { projectId: invitation.projectId, email: invitation.email, status },
      }),
      this.prisma.projectInvitation.update({
        where: { id: invitation.id },
        data: { status, ...(userId && { userId }) },
      }),
    ];
  }

  private async listPending(
    filter: { projectId?: string; userId?: string },
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<InvitationResponse>> {
    const where = { ...filter, status: "PENDING" as const, expiresAt: { gt: new Date() } };

    const [invitations, total] = await Promise.all([
      this.prisma.projectInvitation.findMany({
        where,
        include: INVITATION_INCLUDE,
        ...paginate(page, limit),
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.projectInvitation.count({ where }),
    ]);

    return toPage(invitations, total, page, limit);
  }

  /** Loads an invitation that is still pending (and unexpired unless `allowExpired`). */
  private async findPending(
    where: Prisma.ProjectInvitationWhereInput,
    { allowExpired = false } = {},
  ): Promise<InvitationRow> {
    const invitation = await this.prisma.projectInvitation.findFirst({
      where,
      include: INVITATION_INCLUDE,
    });

    if (!invitation) throw new NotFoundError("Invitation not found");
    if (invitation.status !== "PENDING") {
      throw new BadRequestError("This invitation is no longer pending");
    }
    if (!allowExpired && invitation.expiresAt <= new Date()) {
      throw new BadRequestError("This invitation has expired");
    }

    return invitation;
  }

  private async verifyRecipient(invitationEmail: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user || user.email.toLowerCase() !== invitationEmail.toLowerCase()) {
      throw new ForbiddenError("This invitation was sent to a different email address");
    }
  }

  private async ensureNotMember(projectId: string, email: string) {
    const existing = await this.prisma.projectMember.findFirst({
      where: { projectId, user: { email } },
    });

    if (existing) throw new ConflictError("User is already a member of this project");
  }

  private async ensureNoPendingInvite(projectId: string, email: string) {
    const existing = await this.prisma.projectInvitation.findFirst({
      where: { projectId, email, status: "PENDING", expiresAt: { gt: new Date() } },
    });

    if (existing) throw new ConflictError("An invitation is already pending for this email");
  }
}
