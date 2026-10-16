import { Elysia } from "elysia";
import { ForbiddenError } from "@/common/errors/http.error";
import { UserRole } from "@/generated/prisma";

/** Role-based access guard; must follow `authGuard` on the same instance so `user` exists. */
export const requireRole = (...roles: UserRole[]) =>
  new Elysia({ name: `role-${roles.join("-")}` }).onBeforeHandle({ as: "scoped" }, (context) => {
    const user = (context as unknown as { user?: { role?: string } }).user;
    const userRole = user?.role as UserRole | null;

    if (!userRole) {
      throw new ForbiddenError("Authentication required");
    }

    if (userRole === UserRole.SUPER_ADMIN) {
      return;
    }

    if (!roles.includes(userRole)) {
      throw new ForbiddenError(
        `Insufficient permissions (have: ${userRole}, need: ${roles.join(" | ")})`,
      );
    }
  });
