import { t } from "elysia";
import { Ecosystem } from "@/generated/prisma";
import { PaginationQueryBaseSchema } from "@/types/pagination";

const EcosystemEnum = t.Enum(Ecosystem);

const GitHubRepoSchema = t.Object({
  id: t.Number(),
  name: t.String(),
  fullName: t.String(),
  isPrivate: t.Boolean(),
  defaultBranch: t.String(),
  description: t.Nullable(t.String()),
  language: t.Nullable(t.String()),
  updatedAt: t.String(),
});

export const GitHubRepoListResponseSchema = t.Object({
  items: t.Array(GitHubRepoSchema),
});

const GitHubDependencyFileSchema = t.Object({
  path: t.String(),
  name: t.String(),
  ecosystem: EcosystemEnum,
});

export const GitHubDependencyFilesResponseSchema = t.Array(GitHubDependencyFileSchema);

export const GitHubFileContentResponseSchema = t.Object({
  content: t.String(),
  fileName: t.String(),
});

export const GitHubRepoListQuerySchema = PaginationQueryBaseSchema;

export const GitHubRepoParamsSchema = t.Object({
  owner: t.String(),
  repo: t.String(),
});

export const GitHubFileContentQuerySchema = t.Object({
  path: t.String({ minLength: 1 }),
});
