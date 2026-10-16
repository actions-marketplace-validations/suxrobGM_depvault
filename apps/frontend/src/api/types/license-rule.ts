import type { Data } from "@depvault/shared/api";
import type { client } from "@/api/client";

type ProjectById = ReturnType<typeof client.api.projects>;

export type LicenseRuleListResponseDto = Data<ProjectById["license-rules"]["get"]>;

export type LicenseComplianceSummaryDto = Data<ProjectById["license-rules"]["compliance"]["get"]>;
