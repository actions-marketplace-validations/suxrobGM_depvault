import { Elysia } from "elysia";
import { container } from "@/common/di/container";
import { authGuard } from "@/common/middleware";
import { ProjectIdParamSchema } from "@/types/request";
import {
  BatchUpdateDetectionsBodySchema,
  BatchUpdateDetectionsResponseSchema,
  DetectionListQuerySchema,
  DetectionListResponseSchema,
  DetectionParamsSchema,
  DetectionResponseSchema,
  ScanListQuerySchema,
  ScanListResponseSchema,
  ScanResponseSchema,
  ScanSummaryResponseSchema,
  UpdateDetectionBodySchema,
} from "./secret-scan.schema";
import { SecretScanService } from "./secret-scan.service";

const secretScanService = container.get(SecretScanService);

export const secretScanController = new Elysia({
  prefix: "/projects/:id",
  detail: { tags: ["Secret Scanning"], security: [{ bearerAuth: [] }] },
})
  .use(authGuard)
  .get(
    "/scans",
    ({ params, query }) => secretScanService.listScans(params.id, query.page, query.limit),
    {
      params: ProjectIdParamSchema,
      query: ScanListQuerySchema,
      response: ScanListResponseSchema,
      projectRole: "VIEWER",
      detail: {
        operationId: "listSecretScans",
        summary: "List secret scans",
        description: "Return a paginated list of secret scans for the project.",
      },
    },
  )
  .get("/detections", ({ params, query }) => secretScanService.listDetections(params.id, query), {
    params: ProjectIdParamSchema,
    query: DetectionListQuerySchema,
    response: DetectionListResponseSchema,
    projectRole: "VIEWER",
    detail: {
      operationId: "listSecretDetections",
      summary: "List secret detections",
      description:
        "Return a paginated list of secret detections with optional status and severity filters.",
    },
  })
  .get("/scan-summary", ({ params }) => secretScanService.getScanSummary(params.id), {
    params: ProjectIdParamSchema,
    response: ScanSummaryResponseSchema,
    projectRole: "VIEWER",
    detail: {
      operationId: "getSecretScanSummary",
      summary: "Get scan summary",
      description:
        "Return scan summary including last scan info, open detections by severity, and resolved count.",
    },
  })
  .post(
    "/scans",
    ({ params, projectMember }) => secretScanService.triggerScan(params.id, projectMember.userId),
    {
      params: ProjectIdParamSchema,
      response: ScanResponseSchema,
      projectRole: "EDITOR",
      detail: {
        operationId: "triggerSecretScan",
        summary: "Trigger secret scan",
        description:
          "Start a new secret scan for the project's connected GitHub repository. Requires editor or owner role.",
      },
    },
  )
  .patch(
    "/detections/:detectionId",
    ({ params, body, projectMember }) =>
      secretScanService.updateDetectionStatus(
        params.id,
        params.detectionId,
        body,
        projectMember.userId,
      ),
    {
      params: DetectionParamsSchema,
      body: UpdateDetectionBodySchema,
      response: DetectionResponseSchema,
      projectRole: "EDITOR",
      detail: {
        operationId: "updateDetectionStatus",
        summary: "Update detection status",
        description:
          "Mark a detection as resolved or false positive. Requires editor or owner role.",
      },
    },
  )
  .patch(
    "/detections",
    ({ params, body, projectMember }) =>
      secretScanService.batchUpdateDetections(params.id, body, projectMember.userId),
    {
      params: ProjectIdParamSchema,
      body: BatchUpdateDetectionsBodySchema,
      response: BatchUpdateDetectionsResponseSchema,
      projectRole: "EDITOR",
      detail: {
        operationId: "batchUpdateDetections",
        summary: "Batch update detection statuses",
        description:
          "Mark multiple detections as resolved or false positive in one request. Only updates OPEN detections. Requires editor or owner role.",
      },
    },
  );
