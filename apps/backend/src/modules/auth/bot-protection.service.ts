import { singleton } from "tsyringe";
import { BadRequestError } from "@/common/errors/http.error";
import { logger } from "@/common/logger/logger";
import { env } from "@/env";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

interface BotCheckInput {
  captchaToken?: string;
  /** Hidden form field; humans never see it, so any value means a bot filled the form. */
  website?: string;
  clientIp: string;
}

/** Rejects automated submissions on public, email-sending endpoints (signup, password reset). */
@singleton()
export class BotProtectionService {
  constructor() {
    if (!env.TURNSTILE_SECRET_KEY) {
      logger.warn("TURNSTILE_SECRET_KEY not set, so CAPTCHA verification is disabled");
    }
  }

  /** Throws when the honeypot is filled or the Turnstile token doesn't verify. */
  async assertHuman(input: BotCheckInput): Promise<void> {
    if (input.website) {
      logger.info({ clientIp: input.clientIp }, "Rejected submission with filled honeypot");
      throw new BadRequestError("Request rejected");
    }

    const secret = env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      return;
    }

    if (!input.captchaToken) {
      throw new BadRequestError("Please complete the CAPTCHA");
    }

    const result = await this.verifyTurnstile(secret, input.captchaToken, input.clientIp);
    if (!result.success) {
      logger.info(
        { clientIp: input.clientIp, errorCodes: result["error-codes"] },
        "CAPTCHA verification failed",
      );
      throw new BadRequestError("CAPTCHA verification failed, please try again");
    }
  }

  // Fails closed: an unreachable Cloudflare must not turn the CAPTCHA off.
  private async verifyTurnstile(
    secret: string,
    token: string,
    clientIp: string,
  ): Promise<TurnstileVerifyResponse> {
    try {
      const response = await fetch(TURNSTILE_VERIFY_URL, {
        method: "POST",
        body: new URLSearchParams({ secret, response: token, remoteip: clientIp }),
        signal: AbortSignal.timeout(5000),
      });
      return (await response.json()) as TurnstileVerifyResponse;
    } catch (error) {
      logger.error({ error }, "Turnstile verification request failed");
      return { success: false };
    }
  }
}
