import { type Static, t } from "elysia";
import { ProjectRole } from "@/generated/prisma";
import { PaginationQueryBaseSchema } from "@/types/pagination";
import { PaginatedResponseSchema } from "@/types/response";

const ProjectRoleSchema = t.Enum(ProjectRole);
export const InviteRoleSchema = t.UnionEnum([ProjectRole.EDITOR, ProjectRole.VIEWER] as const);

export const UpdateMemberRoleBodySchema = t.Object({
  role: InviteRoleSchema,
});

export const MemberParamsSchema = t.Object({
  id: t.String(),
  memberId: t.String(),
});

export const ProjectIdParamSchema = t.Object({
  id: t.String(),
});

export const TransferOwnershipBodySchema = t.Object({
  newOwnerId: t.String(),
});

export const MemberResponseSchema = t.Object({
  id: t.String(),
  projectId: t.String(),
  userId: t.String(),
  role: ProjectRoleSchema,
  createdAt: t.Date(),
  updatedAt: t.Date(),
  user: t.Object({
    id: t.String(),
    email: t.String(),
    firstName: t.String(),
    lastName: t.String(),
    avatarUrl: t.Nullable(t.String()),
  }),
});

export const MemberListQuerySchema = PaginationQueryBaseSchema;

export const MemberListResponseSchema = PaginatedResponseSchema(MemberResponseSchema);

export type UpdateMemberRoleBody = Static<typeof UpdateMemberRoleBodySchema>;
export type TransferOwnershipBody = Static<typeof TransferOwnershipBodySchema>;
export type MemberResponse = Static<typeof MemberResponseSchema>;
