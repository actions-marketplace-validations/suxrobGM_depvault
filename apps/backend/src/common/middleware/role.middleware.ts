import { Elysia } from "elysia";
import { ForbiddenError } from "@/common/errors/http.error";
import { UserRole } from "@/generated/prisma";
import { authGuard } from "./auth.middleware";

/** Role-based access guard. Pulls in `authGuard` (deduplicated by name) for a typed `user`. */
export const requireRole = (...roles: UserRole[]) =>
  new Elysia({ name: `role-${roles.join("-")}` })
    .use(authGuard)
    .onBeforeHandle({ as: "scoped" }, ({ user }) => {
      if (!user) {
        throw new ForbiddenError("Authentication required");
      }

      const userRole = user.role as UserRole;
      if (userRole === UserRole.SUPER_ADMIN || roles.includes(userRole)) {
        return;
      }

      throw new ForbiddenError(
        `Insufficient permissions (have: ${userRole}, need: ${roles.join(" | ")})`,
      );
    });
