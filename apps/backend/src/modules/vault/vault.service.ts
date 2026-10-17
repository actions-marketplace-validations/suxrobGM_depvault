import { timingSafeEqual } from "node:crypto";
import { singleton } from "tsyringe";
import { ConflictError, ForbiddenError, NotFoundError } from "@/common/errors/http.error";
import { KeyGrantType, type Prisma, PrismaClient } from "@/generated/prisma";
import type {
  ChangeVaultPasswordBody,
  ProjectWrappedDek,
  RecoverVaultBody,
  RegenerateRecoveryKeyBody,
  SetupVaultBody,
} from "./vault.schema";

type Tx = Prisma.TransactionClient;

@singleton()
export class VaultService {
  private readonly setupUrl = `${process.env.FRONTEND_URL!.replace(/\/$/, "")}/profile/security`;

  constructor(private readonly prisma: PrismaClient) {}

  async getStatus(userId: string) {
    const vault = await this.prisma.userVault.findUnique({
      where: { userId },
      select: {
        kekSalt: true,
        kekIterations: true,
        publicKey: true,
        wrappedPrivateKey: true,
        wrappedPrivateKeyIv: true,
        wrappedPrivateKeyTag: true,
        wrappedRecoveryKey: true,
        wrappedRecoveryKeyIv: true,
        wrappedRecoveryKeyTag: true,
      },
    });

    return vault ? { hasVault: true, ...vault } : { hasVault: false, setupUrl: this.setupUrl };
  }

  async setup(userId: string, body: SetupVaultBody) {
    const existing = await this.prisma.userVault.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictError("Vault is already set up");
    }

    await this.prisma.userVault.create({ data: { userId, ...body } });
    return { message: "Vault set up successfully" };
  }

  async changePassword(userId: string, body: ChangeVaultPasswordBody) {
    const { selfGrants, ...vault } = body;
    await this.requireVault(userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.userVault.update({ where: { userId }, data: toVaultUpdate(vault) });
      await replaceGrants(tx, userId, KeyGrantType.SELF, selfGrants, KeyGrantType.SELF);
    });

    return { message: "Vault password changed successfully" };
  }

  /**
   * Resets the password and keypair from the recovery key. Shared (ECDH) grants were wrapped for
   * the old keypair and can't be opened anymore, so they're dropped and the member shows as
   * pending again.
   */
  async recover(userId: string, body: RecoverVaultBody) {
    const { recoveryKeyHash, newPublicKey, selfGrants, ...vault } = body;
    const stored = await this.requireVault(userId);

    if (!hashesMatch(stored.recoveryKeyHash, recoveryKeyHash)) {
      throw new ForbiddenError("Incorrect recovery key");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userVault.update({
        where: { userId },
        data: { ...toVaultUpdate(vault), publicKey: newPublicKey },
      });
      await tx.projectKeyGrant.deleteMany({ where: { userId, grantType: KeyGrantType.ECDH } });
      await replaceGrants(tx, userId, KeyGrantType.SELF, selfGrants, KeyGrantType.RECOVERY);
    });

    return { message: "Vault recovered successfully" };
  }

  /** Replaces the recovery key; every project key the user holds gets a fresh RECOVERY grant. */
  async regenerateRecoveryKey(userId: string, body: RegenerateRecoveryKeyBody) {
    const { recoveryGrants, newRecoveryKeyHash, ...vault } = body;
    await this.requireVault(userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.userVault.update({
        where: { userId },
        data: { ...toVaultUpdate(vault), recoveryKeyHash: newRecoveryKeyHash },
      });
      await replaceGrants(tx, userId, KeyGrantType.RECOVERY, recoveryGrants, KeyGrantType.SELF);
    });

    return { message: "Recovery key regenerated successfully" };
  }

  private async requireVault(userId: string) {
    const vault = await this.prisma.userVault.findUnique({
      where: { userId },
      select: { recoveryKeyHash: true },
    });
    if (!vault) {
      throw new NotFoundError("Vault not found");
    }
    return vault;
  }
}

interface VaultKeyFields {
  newKekSalt?: string;
  newKekIterations?: number;
  newWrappedPrivateKey?: string;
  newWrappedPrivateKeyIv?: string;
  newWrappedPrivateKeyTag?: string;
  newWrappedRecoveryKey: string;
  newWrappedRecoveryKeyIv: string;
  newWrappedRecoveryKeyTag: string;
}

const toVaultUpdate = (body: VaultKeyFields): Prisma.UserVaultUpdateInput => ({
  kekSalt: body.newKekSalt,
  kekIterations: body.newKekIterations,
  wrappedPrivateKey: body.newWrappedPrivateKey,
  wrappedPrivateKeyIv: body.newWrappedPrivateKeyIv,
  wrappedPrivateKeyTag: body.newWrappedPrivateKeyTag,
  wrappedRecoveryKey: body.newWrappedRecoveryKey,
  wrappedRecoveryKeyIv: body.newWrappedRecoveryKeyIv,
  wrappedRecoveryKeyTag: body.newWrappedRecoveryKeyTag,
});

const hashesMatch = (stored: string, given: string): boolean => {
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Replaces the user's `type` grants with `grants`, which must cover exactly the projects they hold
 * a `coverType` grant for. A project added or removed mid-re-key would otherwise keep a grant
 * wrapped under the old key, or gain one for a project the user left.
 */
async function replaceGrants(
  tx: Tx,
  userId: string,
  type: KeyGrantType,
  grants: ProjectWrappedDek[],
  coverType: KeyGrantType,
): Promise<void> {
  const held = await tx.projectKeyGrant.findMany({
    where: { userId, grantType: coverType },
    select: { projectId: true },
  });
  const submitted = new Set(grants.map((g) => g.projectId));
  const covered =
    submitted.size === grants.length &&
    submitted.size === held.length &&
    held.every((g) => submitted.has(g.projectId));
  if (!covered) {
    throw new ConflictError("Your project keys changed during this update. Please try again.");
  }

  await tx.projectKeyGrant.deleteMany({ where: { userId, grantType: type } });
  await tx.projectKeyGrant.createMany({
    data: grants.map((g) => ({ ...g, userId, grantType: type })),
  });
}
