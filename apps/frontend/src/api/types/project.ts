import type { Body, Data } from "@depvault/shared/api";
import type { client } from "@/api/client";

type Projects = typeof client.api.projects;
type ProjectById = ReturnType<Projects>;
type Invitations = typeof client.api.invitations;
type InvitationById = ReturnType<Invitations>;

type ProjectListResponseDto = Data<Projects["get"]>;
export type ProjectDto = ProjectListResponseDto["items"][number];

export type CreateProjectBody = Body<Projects["post"]>;
export type UpdateProjectBody = Body<ProjectById["put"]>;

type MemberListResponseDto = Data<ProjectById["members"]["get"]>;
export type MemberDto = MemberListResponseDto["items"][number];

/** Members who don't hold a key grant for the project yet. */
export type PendingKeyGrantListDto = Data<ProjectById["keygrants"]["pending"]["get"]>;

type InvitationListResponseDto = Data<ProjectById["invitations"]["get"]>;
export type InvitationDto = InvitationListResponseDto["items"][number];

export type InvitationInfoDto = Data<InvitationById["info"]["get"]>;
