import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { BadRequestError } from "@/common/errors/http.error";
import { env } from "@/env";
import { BotProtectionService } from "./bot-protection.service";

mock.module("@/common/logger/logger", () => ({
  logger: { info: mock(), warn: mock(), error: mock() },
}));

describe("BotProtectionService", () => {
  const originalSecret = env.TURNSTILE_SECRET_KEY;
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

  const mockTurnstile = (body: unknown) =>
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(body)));

  beforeEach(() => {
    env.TURNSTILE_SECRET_KEY = "turnstile-secret";
    fetchSpy = spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    env.TURNSTILE_SECRET_KEY = originalSecret;
    fetchSpy.mockRestore();
  });

  describe("assertHuman", () => {
    it("should reject a filled honeypot without calling Turnstile", async () => {
      const service = new BotProtectionService();

      await expect(
        service.assertHuman({ website: "spam.example", captchaToken: "t", clientIp: "1.2.3.4" }),
      ).rejects.toBeInstanceOf(BadRequestError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("should skip CAPTCHA when no secret key is configured", async () => {
      env.TURNSTILE_SECRET_KEY = undefined;
      const service = new BotProtectionService();

      await service.assertHuman({ clientIp: "1.2.3.4" });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("should reject a missing token when CAPTCHA is enabled", async () => {
      const service = new BotProtectionService();

      await expect(service.assertHuman({ clientIp: "1.2.3.4" })).rejects.toBeInstanceOf(
        BadRequestError,
      );
    });

    it("should pass a token Turnstile accepts", async () => {
      mockTurnstile({ success: true });
      const service = new BotProtectionService();

      await service.assertHuman({ captchaToken: "good", clientIp: "1.2.3.4" });

      const body = fetchSpy.mock.calls[0]?.[1]?.body as URLSearchParams;
      expect(body.get("secret")).toBe("turnstile-secret");
      expect(body.get("response")).toBe("good");
      expect(body.get("remoteip")).toBe("1.2.3.4");
    });

    it("should reject a token Turnstile refuses", async () => {
      mockTurnstile({ success: false, "error-codes": ["invalid-input-response"] });
      const service = new BotProtectionService();

      await expect(
        service.assertHuman({ captchaToken: "bad", clientIp: "1.2.3.4" }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("should fail closed when Turnstile is unreachable", async () => {
      fetchSpy.mockRejectedValue(new Error("network down"));
      const service = new BotProtectionService();

      await expect(
        service.assertHuman({ captchaToken: "any", clientIp: "1.2.3.4" }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });
  });
});
