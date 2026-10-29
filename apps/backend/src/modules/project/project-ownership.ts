import { NotFoundError } from "@/common/errors/http.error";
import type { Prisma, PrismaClient } from "@/generated/prisma";

/** Where-filter for the projects a user owns; ownership lives on the OWNER membership. */
export function ownedBy(userId: string): Prisma.ProjectWhereInput {
  return { members: { some: { userId, role: "OWNER" } } };
}

/** Returns the user id of the project's owner, or null when the project has none. */
export async function findProjectOwner(
  prisma: PrismaClient,
  projectId: string,
): Promise<string | null> {
  const owner = await prisma.projectMember.findFirst({
    where: { projectId, role: "OWNER" },
    select: { userId: true },
  });
  return owner?.userId ?? null;
}

/** Returns the user id of the project's owner; 404 when there is none. */
export async function findProjectOwnerId(prisma: PrismaClient, projectId: string): Promise<string> {
  const ownerId = await findProjectOwner(prisma, projectId);

  if (!ownerId) {
    throw new NotFoundError("Project not found");
  }

  return ownerId;
}
