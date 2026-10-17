import { PROJECT_ROLE_LEVEL } from "@depvault/shared/constants";
import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import { container } from "@/common/di/container";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/common/errors/http.error";
import { env } from "@/env";
import { PrismaClient, type ProjectRole } from "@/generated/prisma";

export interface JwtPayload {
  id: string;
  role: string; // user role (e.g. "USER", "ADMIN")
  email: string;
}

/** The caller's membership in the project addressed by the route's `:id` param. */
export interface ProjectMemberContext {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
}

/** Minimal shape of the `@elysiajs/jwt` provider used for verification. */
interface JwtVerifier {
  verify: (token: string) => Promise<Record<string, unknown> | false>;
}

/** Extracts a Bearer token from the Authorization header or access_token cookie. */
function extractToken(
  headers: Record<string, string | undefined>,
  cookie: Record<string, { value?: unknown }>,
): string {
  const authorization = headers.authorization;
  const cookieToken = cookie.access_token?.value;

  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : typeof cookieToken === "string"
      ? cookieToken
      : undefined;

  if (!token) {
    throw new UnauthorizedError("Missing or invalid authorization header");
  }

  return token;
}

/** Verifies a JWT and returns the decoded user payload. */
async function verifyToken(jwtProvider: JwtVerifier, token: string): Promise<JwtPayload> {
  const payload = await jwtProvider.verify(token);

  if (!payload) {
    throw new UnauthorizedError("Invalid or expired token");
  }

  return {
    id: String(payload.sub),
    role: String(payload.role),
    email: String(payload.email),
  };
}

/**
 * Loads the caller's membership in the project from `params.id` and checks it meets `minRole`.
 * Non-members get a 404 so project ids can't be probed.
 */
async function requireProjectRole(
  params: Record<string, string | undefined>,
  user: JwtPayload | undefined,
  minRole: ProjectRole,
): Promise<ProjectMemberContext> {
  if (!user) {
    throw new UnauthorizedError();
  }

  const projectId = params.id;
  if (!projectId) {
    throw new NotFoundError("Project not found");
  }

  const member = await container.resolve(PrismaClient).projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: { id: true, projectId: true, userId: true, role: true },
  });

  if (!member) {
    throw new NotFoundError("Project not found");
  }

  if (PROJECT_ROLE_LEVEL[member.role] < PROJECT_ROLE_LEVEL[minRole]) {
    throw new ForbiddenError("Insufficient project permissions");
  }

  return member;
}

/**
 * JWT auth guard that derives `user` (id, role, email) into the request context. Also provides
 * the `projectRole` route option: `{ projectRole: "EDITOR" }` checks the caller's role in the
 * project from `params.id` and resolves `projectMember`.
 */
export const authGuard = new Elysia({ name: "auth-guard" })
  .use(jwt({ name: "jwt", secret: env.JWT_SECRET }))
  .derive({ as: "scoped" }, async ({ headers, cookie, jwt }) => {
    const token = extractToken(headers, cookie);
    const user = await verifyToken(jwt, token);
    return { user };
  })
  .macro({
    projectRole: (minRole: ProjectRole) => ({
      async resolve({ user, params }) {
        const projectMember = await requireProjectRole(params, user, minRole);
        return { projectMember };
      },
    }),
  });
