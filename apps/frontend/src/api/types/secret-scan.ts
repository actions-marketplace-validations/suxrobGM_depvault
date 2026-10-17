import type { Body, Data } from "@depvault/shared/api";
import type { client } from "@/api/client";

type ProjectById = ReturnType<typeof client.api.projects>;

type DetectionListResponseDto = Data<ProjectById["detections"]["get"]>;
export type DetectionDto = DetectionListResponseDto["items"][number];

export type BatchUpdateDetectionsBody = Body<ProjectById["detections"]["patch"]>;

type PatternListResponseDto = Data<ProjectById["scan-patterns"]["get"]>;
export type PatternDto = PatternListResponseDto["items"][number];
