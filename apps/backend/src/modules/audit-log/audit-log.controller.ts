import { Elysia } from "elysia";
import { container } from "@/common/di/container";
import { authGuard } from "@/common/middleware";
import { StringIdParamSchema } from "@/types/request";
import {
  AuditLogListQuerySchema,
  AuditLogListResponseSchema,
  GlobalAuditLogListQuerySchema,
  GlobalAuditLogListResponseSchema,
} from "./audit-log.schema";
import { AuditLogService } from "./audit-log.service";

const auditLogService = container.resolve(AuditLogService);

export const auditLogController = new Elysia({
  prefix: "/projects/:id/audit-log",
  detail: { tags: ["Audit Log"], security: [{ bearerAuth: [] }] },
})
  .use(authGuard)
  .get(
    "/",
    ({ params, query: { page, limit, ...filters } }) =>
      auditLogService.list(params.id, filters, page, limit),
    {
      params: StringIdParamSchema,
      query: AuditLogListQuerySchema,
      response: AuditLogListResponseSchema,
      projectRole: "EDITOR",
      detail: {
        operationId: "listAuditLog",
        summary: "List audit log events",
        description:
          "Return a paginated list of audit log events for a project. Only owners and editors can view audit logs. Audit logs are append-only and cannot be modified or deleted.",
      },
    },
  );

export const activityController = new Elysia({
  prefix: "/activity",
  detail: { tags: ["Activity"], security: [{ bearerAuth: [] }] },
})
  .use(authGuard)
  .get(
    "/",
    ({ query: { page, limit, ...filters }, user }) =>
      auditLogService.listGlobal(user.id, filters, page, limit),
    {
      query: GlobalAuditLogListQuerySchema,
      response: GlobalAuditLogListResponseSchema,
      detail: {
        operationId: "listActivity",
        summary: "List global activity",
        description:
          "Return a paginated list of audit log events across all projects where the user is an owner or editor.",
      },
    },
  );
