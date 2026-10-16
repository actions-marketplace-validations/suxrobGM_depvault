import { PROJECT_ROLE_LEVEL } from "@depvault/shared/constants";
import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { container } from "@/common/di/container";
import { ForbiddenError, NotFoundError } from "@/common/errors/http.error";
import { PrismaClient, ProjectRole } from "@/generated/prisma";
import { extractToken, type JwtVerifier, verifyToken } from "./auth.middleware";

const prisma = container.resolve(PrismaClient);

/**
 * Project role guard: verifies the JWT, resolves the member from `params.id`, and injects
 * `user` + `projectMember`. Each role gets its own named JWT instance so Elysia's plugin
 * deduplication doesn't collapse multiple guards on the same controller.
 */
export const projectGuard = (minRole: ProjectRole = "VIEWER") =>
  new Elysia({ name: `project-guard-${minRole}` })
    .use(jwt({ name: `jwt-${minRole}`, secret: process.env.JWT_SECRET! }))
    .derive({ as: "scoped" }, async ({ headers, cookie, params, ...ctx }) => {
      const jwtProvider = (ctx as unknown as Record<string, JwtVerifier>)[`jwt-${minRole}`]!;
      const projectId = params.id!;

      const token = extractToken(headers, cookie);
      const user = await verifyToken(jwtProvider, token);

      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: user.id } },
      });

      if (!member) {
        throw new NotFoundError("Project not found");
      }

      const memberLevel = PROJECT_ROLE_LEVEL[member.role] ?? 0;
      const requiredLevel = PROJECT_ROLE_LEVEL[minRole];

      if (memberLevel < requiredLevel) {
        throw new ForbiddenError("Insufficient project permissions");
      }

      return {
        user,
        projectMember: {
          id: member.id,
          projectId: member.projectId,
          userId: member.userId,
          role: member.role,
        },
      };
    });
