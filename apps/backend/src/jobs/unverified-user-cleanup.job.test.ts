import { describe, expect, it, mock } from "bun:test";
import type { PrismaClient } from "@/generated/prisma";
import { deleteStaleUnverifiedUsers } from "./unverified-user-cleanup.job";

describe("deleteStaleUnverifiedUsers", () => {
  it("should only target old, empty, unverified regular accounts", async () => {
    const deleteMany = mock(() => Promise.resolve({ count: 3 }));
    const prisma = { user: { deleteMany } } as unknown as PrismaClient;

    const count = await deleteStaleUnverifiedUsers(prisma);

    expect(count).toBe(3);
    expect(deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        emailVerified: false,
        role: "USER",
        createdAt: { lt: expect.any(Date) },
        updatedAt: { lt: expect.any(Date) },
        projectMemberships: { none: {} },
        vault: { is: null },
        subscription: { is: null },
      }),
    });
  });
});
