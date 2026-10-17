import { NotFoundError } from "@/common/errors/http.error";
import type { Prisma, PrismaClient } from "@/generated/prisma";

/** Where-filter for the projects a user owns; ownership lives on the OWNER membership. */
export function ownedBy(userId: string): Prisma.ProjectWhereInput {
  return { members: { some: { userId, role: "OWNER" } } };
}

/** Returns the user id of the project's owner. */
export async function findProjectOwnerId(prisma: PrismaClient, projectId: string): Promise<string> {
  const owner = await prisma.projectMember.findFirst({
    where: { projectId, role: "OWNER" },
    select: { userId: true },
  });

  if (!owner) {
    throw new NotFoundError("Project not found");
  }

  return owner.userId;
}
