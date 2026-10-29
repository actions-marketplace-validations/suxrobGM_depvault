import type { Prisma, SecretScan } from "@/generated/prisma";
import type { DetectionResponse, ScanResponse } from "./secret-scan.schema";

export const DETECTION_INCLUDE = {
  scanPattern: { select: { name: true, severity: true } },
} as const;

type DetectionRow = Prisma.SecretDetectionGetPayload<{ include: typeof DETECTION_INCLUDE }>;

export function toScanResponse(scan: SecretScan): ScanResponse {
  return {
    id: scan.id,
    projectId: scan.projectId,
    triggeredById: scan.triggeredById,
    status: scan.status,
    commitsScanned: scan.commitsScanned,
    detectionsFound: scan.detectionsFound,
    startedAt: scan.startedAt,
    completedAt: scan.completedAt,
    errorMessage: scan.errorMessage,
    createdAt: scan.createdAt,
  };
}

export function toDetectionResponse(d: DetectionRow): DetectionResponse {
  return {
    id: d.id,
    projectId: d.projectId,
    scanId: d.scanId,
    commitHash: d.commitHash,
    filePath: d.filePath,
    lineNumber: d.lineNumber,
    matchSnippet: d.matchSnippet,
    status: d.status,
    resolvedById: d.resolvedById,
    resolvedAt: d.resolvedAt,
    remediationSteps: d.remediationSteps,
    createdAt: d.createdAt,
    patternName: d.scanPattern.name,
    patternSeverity: d.scanPattern.severity,
  };
}
