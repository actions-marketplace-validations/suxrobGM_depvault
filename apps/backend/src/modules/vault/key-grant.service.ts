import { singleton } from "tsyringe";
import { BadRequestError, ConflictError, NotFoundError } from "@/common/errors/http.error";
import { KeyGrantType, PrismaClient } from "@/generated/prisma";
import type { ShareKeyGrantBody, StoreOwnGrantsBody } from "./vault.schema";

const WRAPPED_DEK_SELECT = { wrappedDek: true, wrappedDekIv: true, wrappedDekTag: true } as const;

/** Grants that open a project for their holder; RECOVERY grants only matter during recovery. */
const ACCESS_GRANT_TYPES = [KeyGrantType.SELF, KeyGrantType.ECDH];

@singleton()
export class KeyGrantService {
  constructor(private readonly prisma: PrismaClient) {}

  /** The caller's own key for a project, preferring SELF over a not-yet-adopted shared grant. */
  async getForUser(projectId: string, userId: string) {
    const grant = await this.prisma.projectKeyGrant.findFirst({
      where: { projectId, userId, grantType: { in: ACCESS_GRANT_TYPES } },
      // Enum order is SELF, ECDH, RECOVERY.
      orderBy: { grantType: "asc" },
      select: { ...WRAPPED_DEK_SELECT, granterPublicKey: true, grantType: true },
    });

    if (!grant) {
      throw new NotFoundError("No key grant found for this project");
    }
    return grant;
  }

  /**
   * Stores the caller's SELF + RECOVERY grants together: a project's first key, or adopting a key
   * a teammate shared. The shared copy is dropped since it dies with the caller's keypair.
   */
  async storeOwn(projectId: string, userId: string, body: StoreOwnGrantsBody) {
    await this.prisma.$transaction(async (tx) => {
      // Serializes first-key creation so two members can't introduce competing DEKs.
      await tx.$queryRaw`SELECT 1 FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;

      const holders = await tx.projectKeyGrant.findMany({
        where: { projectId },
        select: { userId: true },
        distinct: ["userId"],
      });
      if (holders.length > 0 && !holders.some((h) => h.userId === userId)) {
        throw new ConflictError(
          "This project already has an encryption key. Ask an Editor or Owner to grant you access.",
        );
      }

      for (const [grantType, wrapped] of [
        [KeyGrantType.SELF, body.self],
        [KeyGrantType.RECOVERY, body.recovery],
      ] as const) {
        await tx.projectKeyGrant.upsert({
          where: { projectId_userId_grantType: { projectId, userId, grantType } },
          create: { projectId, userId, grantType, ...wrapped },
          update: wrapped,
        });
      }
      await tx.projectKeyGrant.deleteMany({
        where: { projectId, userId, grantType: KeyGrantType.ECDH },
      });
    });

    return { message: "Key grants stored" };
  }

  /**
   * Hands a member the project key, wrapped under an ECDH secret with the granter's current
   * keypair. The recipient replaces it with their own grants on first use.
   */
  async shareWithMember(projectId: string, granterId: string, body: ShareKeyGrantBody) {
    const { userId, ...wrapped } = body;
    if (userId === granterId) {
      throw new BadRequestError("Store your own key with PUT /keygrants/my");
    }

    const [member, granterVault] = await Promise.all([
      this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
        select: { user: { select: { vault: { select: { id: true } } } } },
      }),
      this.prisma.userVault.findUnique({
        where: { userId: granterId },
        select: { publicKey: true },
      }),
    ]);
    if (!member) {
      throw new NotFoundError("User is not a member of this project");
    }
    if (!member.user.vault) {
      throw new BadRequestError("This member hasn't set up their vault yet");
    }
    if (!granterVault) {
      throw new BadRequestError("Set up your vault before granting access");
    }

    const grantType = KeyGrantType.ECDH;
    const data = { ...wrapped, granterPublicKey: granterVault.publicKey };
    await this.prisma.projectKeyGrant.upsert({
      where: { projectId_userId_grantType: { projectId, userId, grantType } },
      create: { projectId, userId, grantType, ...data },
      update: data,
    });

    return { message: "Access granted" };
  }

  async getPendingMembers(projectId: string) {
    const members = await this.prisma.projectMember.findMany({
      where: {
        projectId,
        user: {
          projectKeyGrants: { none: { projectId, grantType: { in: ACCESS_GRANT_TYPES } } },
        },
      },
      select: {
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

    return members.map(({ user }) => ({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      hasVault: !!user.vault,
      publicKey: user.vault?.publicKey ?? null,
    }));
  }

  /** The caller's grants of one type across all projects, for re-keying. */
  listForUser(userId: string, grantType: KeyGrantType) {
    return this.prisma.projectKeyGrant.findMany({
      where: { userId, grantType },
      select: { projectId: true, ...WRAPPED_DEK_SELECT },
    });
  }
}
