import { singleton } from "tsyringe";
import { PlatformInviteTemplate, TeamInviteTemplate } from "@/common/emails";
import { EmailService } from "@/common/services/email.service";
import { env } from "@/env";

type InviteEmailParams = {
  email: string;
  inviterName: string;
  projectName: string;
  role: string;
  token: string;
  isExistingUser: boolean;
};

@singleton()
export class InvitationEmailService {
  private readonly frontendUrl = env.FRONTEND_URL;

  constructor(private readonly emailService: EmailService) {}

  /**
   * Sends an invitation email: a team invite for existing users, a platform invite for new ones.
   * @param reminder Prefixes the subject for a resend
   */
  send(params: InviteEmailParams, reminder = false): void {
    const { email, inviterName, projectName, role, token, isExistingUser } = params;
    const subject = `${reminder ? "Reminder: " : ""}You've been invited to ${projectName} on DepVault`;

    if (isExistingUser) {
      void this.emailService.send({
        to: email,
        subject,
        react: TeamInviteTemplate({
          inviterName,
          projectName,
          role,
          acceptUrl: `${this.frontendUrl}/invitations/${token}`,
          declineUrl: `${this.frontendUrl}/invitations/${token}?action=decline`,
        }),
      });
    } else {
      void this.emailService.send({
        to: email,
        subject,
        react: PlatformInviteTemplate({
          inviterName,
          projectName,
          role,
          registerUrl: `${this.frontendUrl}/register?inviteToken=${token}`,
        }),
      });
    }
  }
}
