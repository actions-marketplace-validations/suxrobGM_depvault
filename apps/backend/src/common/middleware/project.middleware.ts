import { Elysia } from "elysia";
import { UnauthorizedError } from "@/common/errors/http.error";
import type { ProjectRole } from "@/generated/prisma";
import { authGuard, requireProjectRole } from "./auth.middleware";

/**
 * Plugin form of the `projectRole` route option, kept only for the vault key-grant controller.
 * New routes use `.use(authGuard)` with `{ projectRole: "..." }` instead.
 */
export const projectGuard = (minRole: ProjectRole) =>
  new Elysia({ name: `project-guard-${minRole}` })
    .use(authGuard)
    .resolve({ as: "scoped" }, async ({ user, params }) => {
      if (!user) {
        throw new UnauthorizedError();
      }
      return { user, projectMember: await requireProjectRole(params, user, minRole) };
    });
