import "@/common/di/container";
import { Elysia } from "elysia";
import { prisma } from "@/common/database/prisma.client";
import { logger } from "@/common/logger/logger";
import { errorMiddleware } from "@/common/middleware";
import { corsPlugin } from "@/common/plugins/cors.plugin";
import { uploadsStaticPlugin } from "@/common/plugins/static.plugin";
import { swaggerPlugin } from "@/common/plugins/swagger.plugin";
import { env } from "@/env";
import { secretScanCron } from "@/jobs/secret-scan.job";
import { sessionCleanupCron } from "@/jobs/session-cleanup.job";
import { unverifiedUserCleanupCron } from "@/jobs/unverified-user-cleanup.job";
import { adminController } from "@/modules/admin/admin.controller";
import { analysisController } from "@/modules/analysis/analysis.controller";
import { activityController, auditLogController } from "@/modules/audit-log";
import { authController } from "@/modules/auth/auth.controller";
import { ciAccessController, ciTokenController } from "@/modules/ci-token/ci-token.controller";
import { githubApiController } from "@/modules/github/github-api.controller";
import { invitationController } from "@/modules/invitation/invitation.controller";
import { projectInvitationController } from "@/modules/invitation/project-invitation.controller";
import { licenseRuleController } from "@/modules/license-rule/license-rule.controller";
import { notificationController } from "@/modules/notification/notification.controller";
import { projectController } from "@/modules/project/project.controller";
import { repoFileController } from "@/modules/repo-file/repo-file.controller";
import { scanPatternController } from "@/modules/scan-pattern/scan-pattern.controller";
import { secretScanController } from "@/modules/secret-scan";
import { securityController } from "@/modules/security/security.controller";
import { shareLinkController } from "@/modules/share-link/share-link.controller";
import { shareLinkAccessController } from "@/modules/share-link/share-link-access.controller";
import { subscriptionController } from "@/modules/subscription/subscription.controller";
import { subscriptionWebhookController } from "@/modules/subscription/subscription-webhook.controller";
import { userController } from "@/modules/user/user.controller";
import { keyGrantController } from "@/modules/vault/key-grant.controller";
import { vaultController } from "@/modules/vault/vault.controller";
import { HttpErrorResponses } from "@/types/response";

const app = new Elysia()
  .use(errorMiddleware)
  .use(corsPlugin)
  .use(uploadsStaticPlugin)
  .use(secretScanCron)
  .use(sessionCleanupCron)
  .use(unverifiedUserCleanupCron)
  .use(swaggerPlugin)
  .onStop(async () => {
    await prisma.$disconnect();
  })
  .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
  .group("/api", (api) =>
    api
      .guard({
        response: HttpErrorResponses,
      })
      .use(subscriptionWebhookController)
      .use(authController)
      .use(projectController)
      .use(invitationController)
      .use(projectInvitationController)
      .use(repoFileController)
      .use(shareLinkAccessController)
      .use(shareLinkController)
      .use(userController)
      .use(auditLogController)
      .use(analysisController)
      .use(githubApiController)
      .use(notificationController)
      .use(secretScanController)
      .use(scanPatternController)
      .use(ciTokenController)
      .use(ciAccessController)
      .use(licenseRuleController)
      .use(activityController)
      .use(securityController)
      .use(subscriptionController)
      .use(vaultController)
      .use(keyGrantController)
      .use(adminController),
  )
  .listen(env.PORT);

// Export app type for Eden Treaty
export type App = typeof app;

logger.info(`Connect API running at http://${app.server?.hostname}:${app.server?.port}`);
logger.info(
  `Swagger docs available at http://${app.server?.hostname}:${app.server?.port}/api/swagger`,
);
