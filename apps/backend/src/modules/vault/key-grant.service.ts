import { PROJECT_ROLE_LEVEL, type ProjectRole } from "@depvault/shared/constants";
import { singleton } from "tsyringe";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/common/errors/http.error";
import { KeyGrantType, PrismaClient } from "@/generated/prisma";
import type { CreateKeyGrantBody } from "./vault.schema";

export interface KeyGrantCaller {
  userId: string;
  role: ProjectRole;
}

@singleton()
export class KeyGrantService {
  constructor(private readonly prisma: PrismaClient) {}

  async getForUser(projectId: string, userId: string) {
    const grant = await this.prisma.projectKeyGrant.findFirst({
      where: { projectId, userId, grantType: { not: KeyGrantType.RECOVERY } },
      orderBy: { createdAt: "desc" },
    });

    if (!grant) {
      throw new NotFoundError("No key grant found for this project");
    }

    return this.toResponse(grant);
  }

  /**
   * Store a wrapped DEK. Members may create/overwrite only their own SELF or RECOVERY grants;
   * ECDH grants for other members require EDITOR+ and a project-member target. The unique key
   * (projectId, userId, grantType) means nobody can overwrite another user's SELF/RECOVERY grant.
   */
  async create(projectId: string, caller: KeyGrantCaller, body: CreateKeyGrantBody) {
    const grantType = (body.grantType as KeyGrantType) ?? KeyGrantType.ECDH;
    const isSelf = body.userId === caller.userId;

    if (isSelf && grantType === KeyGrantType.ECDH) {
      throw new BadRequestError("Use a SELF grant for your own key, not ECDH");
    }

    if (!isSelf) {
      if (grantType !== KeyGrantType.ECDH) {
        throw new ForbiddenError("Only ECDH grants can be created for other members");
      }
      if (PROJECT_ROLE_LEVEL[caller.role] < PROJECT_ROLE_LEVEL.EDITOR) {
        throw new ForbiddenError("Editor role required to grant project keys to other members");
      }
      if (!body.granterPublicKey) {
        throw new BadRequestError("granterPublicKey is required for ECDH grants");
      }

      const targetMember = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: body.userId } },
      });
      if (!targetMember) {
        throw new NotFoundError("User is not a member of this project");
      }
    }

    const existing = await this.prisma.projectKeyGrant.findUnique({
      where: { projectId_userId_grantType: { projectId, userId: body.userId, grantType } },
    });

    if (existing) {
      const updated = await this.prisma.projectKeyGrant.update({
        where: { id: existing.id },
        data: {
          wrappedDek: body.wrappedDek,
          wrappedDekIv: body.wrappedDekIv,
          wrappedDekTag: body.wrappedDekTag,
          granterPublicKey: body.granterPublicKey ?? null,
        },
      });
      return this.toResponse(updated);
    }

    const grant = await this.prisma.projectKeyGrant.create({
      data: {
        projectId,
        userId: body.userId,
        wrappedDek: body.wrappedDek,
        wrappedDekIv: body.wrappedDekIv,
        wrappedDekTag: body.wrappedDekTag,
        granterPublicKey: body.granterPublicKey ?? null,
        grantType,
      },
    });

    return this.toResponse(grant);
  }

  async getPendingMembers(projectId: string) {
    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            vault: { select: { publicKey: true } },
          },
        },
      },
    });

    const grants = await this.prisma.projectKeyGrant.findMany({
      where: { projectId, grantType: { not: KeyGrantType.RECOVERY } },
      select: { userId: true },
    });

    const grantedUserIds = new Set(grants.map((g) => g.userId));

    return members
      .filter((m) => !grantedUserIds.has(m.userId))
      .map((m) => ({
        userId: m.user.id,
        email: m.user.email,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        hasVault: !!m.user.vault,
        publicKey: m.user.vault?.publicKey ?? null,
      }));
  }

  async batchUpdateForUser(
    userId: string,
    grants: Array<{
      projectId: string;
      wrappedDek: string;
      wrappedDekIv: string;
      wrappedDekTag: string;
    }>,
  ) {
    await this.prisma.$transaction(
      grants.map((g) =>
        this.prisma.projectKeyGrant.updateMany({
          where: { projectId: g.projectId, userId, grantType: KeyGrantType.SELF },
          data: {
            wrappedDek: g.wrappedDek,
            wrappedDekIv: g.wrappedDekIv,
            wrappedDekTag: g.wrappedDekTag,
          },
        }),
      ),
    );

    return { message: "Key grants updated" };
  }

  async getAllGrantsForUserByType(userId: string, grantType: KeyGrantType) {
    const grants = await this.prisma.projectKeyGrant.findMany({
      where: { userId, grantType },
      select: {
        projectId: true,
        wrappedDek: true,
        wrappedDekIv: true,
        wrappedDekTag: true,
      },
    });

    return grants.map((g) => ({
      projectId: g.projectId,
      wrappedDek: g.wrappedDek,
      wrappedDekIv: g.wrappedDekIv,
      wrappedDekTag: g.wrappedDekTag,
    }));
  }

  private toResponse(grant: {
    id: string;
    projectId: string;
    userId: string;
    wrappedDek: string;
    wrappedDekIv: string;
    wrappedDekTag: string;
    granterPublicKey: string | null;
    grantType: KeyGrantType;
  }) {
    return {
      id: grant.id,
      projectId: grant.projectId,
      userId: grant.userId,
      wrappedDek: grant.wrappedDek,
      wrappedDekIv: grant.wrappedDekIv,
      wrappedDekTag: grant.wrappedDekTag,
      granterPublicKey: grant.granterPublicKey,
      grantType: grant.grantType,
    };
  }
}
