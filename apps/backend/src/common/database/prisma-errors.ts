import { Prisma } from "@/generated/prisma";

/** Whether a Prisma call failed on a unique constraint (P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
