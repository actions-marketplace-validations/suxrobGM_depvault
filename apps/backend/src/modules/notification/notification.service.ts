import { inject, injectable } from "@needle-di/core";
import type { ReactElement } from "react";
import {
  GitSecretAlertTemplate,
  MemberRemovedTemplate,
  RoleChangeTemplate,
  VulnerabilityAlertTemplate,
} from "@/common/emails";
import { NotFoundError } from "@/common/errors/http.error";
import { logger } from "@/common/logger/logger";
import { EmailService } from "@/common/services/email.service";
import { env } from "@/env";
import {
  type Notification,
  type NotificationType,
  type Prisma,
  PrismaClient,
} from "@/generated/prisma";
import { paginate, toPage } from "@/types/pagination";
import type { PaginatedResponse } from "@/types/response";
import type { NotificationResponse } from "./notification.schema";
import { createNotificationContent, type NotifyPayload } from "./notification.utils";

const toResponse = (n: Notification): NotificationResponse => ({
  id: n.id,
  userId: n.userId,
  type: n.type,
  title: n.title,
  message: n.message,
  read: n.read,
  metadata: n.metadata as Record<string, unknown> | null,
  createdAt: n.createdAt,
  updatedAt: n.updatedAt,
});

interface NotificationEmail {
  subject: string;
  react: ReactElement;
}

@injectable()
export class NotificationService {
  constructor(
    private readonly prisma = inject(PrismaClient),
    private readonly emailService = inject(EmailService),
  ) {}

  /** Stores an in-app notification and sends the matching email; failures are only logged. */
  async notify(payload: NotifyPayload): Promise<void> {
    try {
      const [user, project] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: payload.userId },
          select: { firstName: true, email: true },
        }),
        this.prisma.project.findUnique({
          where: { id: payload.projectId },
          select: { name: true },
        }),
      ]);

      if (!user || !project) {
        logger.warn({ payload }, "Notification skipped: user or project not found");
        return;
      }

      const content = createNotificationContent(payload, project.name);

      await this.prisma.notification.create({
        data: {
          userId: payload.userId,
          type: payload.type,
          title: content.title,
          message: content.message,
          metadata: content.metadata as Prisma.InputJsonValue,
        },
      });

      this.sendEmail(payload, user.firstName, user.email, project.name);
    } catch (error) {
      logger.error({ error, payload }, "Failed to create notification");
    }
  }

  async list(
    userId: string,
    filters: { type?: NotificationType; read?: boolean },
    page = 1,
    limit = 20,
  ): Promise<PaginatedResponse<NotificationResponse>> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(filters.type && { type: filters.type }),
      ...(filters.read !== undefined && { read: filters.read }),
    };

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        ...paginate(page, limit),
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return toPage(notifications.map(toResponse), total, page, limit);
  }

  async markRead(userId: string, notificationId: string): Promise<NotificationResponse> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });

    if (count === 0) {
      throw new NotFoundError("Notification not found");
    }

    return toResponse(
      await this.prisma.notification.findUniqueOrThrow({ where: { id: notificationId } }),
    );
  }

  async markAllRead(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    return { count: result.count };
  }

  async delete(userId: string, notificationId: string): Promise<{ message: string }> {
    const { count } = await this.prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });

    if (count === 0) {
      throw new NotFoundError("Notification not found");
    }

    return { message: "Notification deleted" };
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, read: false },
    });

    return { count };
  }

  private sendEmail(
    payload: NotifyPayload,
    firstName: string,
    email: string,
    projectName: string,
  ): void {
    const content = this.emailContent(payload, firstName, projectName);
    if (content) {
      void this.emailService.send({ to: email, ...content });
    }
  }

  private emailContent(
    payload: NotifyPayload,
    firstName: string,
    projectName: string,
  ): NotificationEmail | null {
    const dashboardUrl = `${env.FRONTEND_URL}/notifications`;

    switch (payload.type) {
      case "VULNERABILITY_FOUND":
        return {
          subject: `Vulnerability Alert: ${projectName}`,
          react: VulnerabilityAlertTemplate({
            firstName,
            projectName,
            count: payload.count,
            dashboardUrl,
          }),
        };
      case "GIT_SECRET_DETECTION":
        return {
          subject: `Secret Detected in Repository: ${projectName}`,
          react: GitSecretAlertTemplate({
            firstName,
            projectName,
            fileName: payload.fileName,
            dashboardUrl,
          }),
        };
      case "ROLE_CHANGE":
        return {
          subject: `Your role changed in ${projectName} on DepVault`,
          react: RoleChangeTemplate({
            firstName,
            projectName,
            oldRole: payload.oldRole,
            newRole: payload.newRole,
            dashboardUrl,
          }),
        };
      case "INVITATION_RECEIVED":
        // The invitation email itself is sent by InvitationEmailService.
        return null;
      case "MEMBER_REMOVED":
        return {
          subject: `You've been removed from ${projectName} on DepVault`,
          react: MemberRemovedTemplate({ firstName, projectName, dashboardUrl }),
        };
    }
  }
}
