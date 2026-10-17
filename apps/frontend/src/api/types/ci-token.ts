import type { Body } from "@depvault/shared/api";
import type { client } from "@/api/client";

type ProjectById = ReturnType<typeof client.api.projects>;

export type CreateCiTokenBody = Body<ProjectById["ci-tokens"]["post"]>;
