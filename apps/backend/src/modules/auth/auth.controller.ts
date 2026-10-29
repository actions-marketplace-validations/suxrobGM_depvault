import { decodeOAuthState } from "@depvault/shared/utils";
import { Elysia } from "elysia";
import { container } from "@/common/di/container";
import { authGuard } from "@/common/middleware/auth.middleware";
import { withClientIp } from "@/common/middleware/client-ip.middleware";
import { HOUR_MS, MINUTE_MS, rateLimiter } from "@/common/middleware/rate-limiter";
import { env } from "@/env";
import { MessageResponseSchema, TooManyRequestsErrorSchema } from "@/types/response";
import {
  AuthResponseSchema,
  DeviceCodeResponseSchema,
  DeviceTokenBodySchema,
  DeviceTokenResponseSchema,
  DeviceVerifyBodySchema,
  ForgotPasswordBodySchema,
  GitHubAuthQuerySchema,
  GitHubCallbackQuerySchema,
  LoginBodySchema,
  RegisterBodySchema,
  ResetPasswordBodySchema,
  VerifyEmailBodySchema,
} from "./auth.schema";
import { AuthService } from "./auth.service";
import { clearAuthCookies, setAuthCookies } from "./auth.utils";
import { BotProtectionService } from "./bot-protection.service";
import { DeviceCodeService } from "./device-code.service";
import { GitHubService } from "./github.service";

const authService = container.resolve(AuthService);
const githubService = container.resolve(GitHubService);
const deviceCodeService = container.resolve(DeviceCodeService);
const botProtectionService = container.resolve(BotProtectionService);

export const authController = new Elysia({ prefix: "/auth", detail: { tags: ["Auth"] } })
  .use(withClientIp)
  .use(rateLimiter)
  .post(
    "/accounts",
    async ({ body, cookie, clientIp }) => {
      await botProtectionService.assertHuman({
        captchaToken: body.captchaToken,
        website: body.website,
        clientIp,
      });
      const result = await authService.register(body);
      setAuthCookies(cookie, result);
      return result;
    },
    {
      body: RegisterBodySchema,
      rateLimit: { max: 5, windowMs: HOUR_MS },
      response: { 200: AuthResponseSchema, ...TooManyRequestsErrorSchema },
      detail: {
        operationId: "registerUser",
        summary: "Register with email and password",
        description:
          "Create a new account with email, username, and password. Returns JWT tokens. A verification email is sent to confirm the address. Requires a Turnstile `captchaToken` when CAPTCHA is enabled.",
      },
    },
  )
  .post(
    "/session",
    async ({ body, cookie }) => {
      const result = await authService.login(body);
      setAuthCookies(cookie, result);
      return result;
    },
    {
      body: LoginBodySchema,
      rateLimit: { max: 5, windowMs: MINUTE_MS },
      response: { 200: AuthResponseSchema, ...TooManyRequestsErrorSchema },
      detail: {
        operationId: "loginUser",
        summary: "Login with email and password",
        description:
          "Authenticate with email and password. Returns JWT access and refresh tokens. Email must be verified before login is allowed.",
      },
    },
  )
  .put(
    "/session",
    async ({ cookie }) => {
      const refreshToken = String(cookie.refresh_token?.value ?? "");
      const result = await authService.refresh(refreshToken);
      setAuthCookies(cookie, result);
      return result;
    },
    {
      response: AuthResponseSchema,
      detail: {
        operationId: "refreshToken",
        summary: "Refresh access token",
        description:
          "Exchange the refresh_token cookie for a new access/refresh token pair. The old refresh token is invalidated (rotation).",
      },
    },
  )
  .delete(
    "/session",
    async ({ cookie }) => {
      await authService.logout(String(cookie.refresh_token?.value ?? ""));
      clearAuthCookies(cookie);
      return { message: "Logged out successfully" };
    },
    {
      response: MessageResponseSchema,
      detail: {
        operationId: "logoutUser",
        summary: "Logout and clear auth cookies",
        description: "Revokes the refresh session server-side and clears httpOnly auth cookies.",
      },
    },
  )

  .post(
    "/password-resets",
    async ({ body, clientIp }) => {
      await botProtectionService.assertHuman({ captchaToken: body.captchaToken, clientIp });
      return authService.forgotPassword(body);
    },
    {
      body: ForgotPasswordBodySchema,
      rateLimit: { max: 3, windowMs: HOUR_MS },
      response: { 200: MessageResponseSchema, ...TooManyRequestsErrorSchema },
      detail: {
        operationId: "forgotPassword",
        summary: "Request password reset email",
        description:
          "Send a password reset link to the provided email. Always returns success to prevent email enumeration. Requires a Turnstile `captchaToken` when CAPTCHA is enabled.",
      },
    },
  )
  .put("/password-resets", ({ body }) => authService.resetPassword(body), {
    body: ResetPasswordBodySchema,
    rateLimit: { max: 3, windowMs: HOUR_MS },
    response: { 200: MessageResponseSchema, ...TooManyRequestsErrorSchema },
    detail: {
      operationId: "resetPassword",
      summary: "Reset password with token",
      description:
        "Set a new password using the reset token from the email link. Revokes all existing refresh tokens for security.",
    },
  })
  .post("/email-verifications", ({ body }) => authService.verifyEmail(body), {
    body: VerifyEmailBodySchema,
    rateLimit: { max: 3, windowMs: HOUR_MS },
    response: { 200: MessageResponseSchema, ...TooManyRequestsErrorSchema },
    detail: {
      operationId: "verifyEmail",
      summary: "Verify email address",
      description:
        "Confirm email ownership using the verification token sent during registration or email change.",
    },
  })
  .get(
    "/github",
    ({ query, set }) => {
      const url = githubService.getAuthUrl(query.redirect);
      set.status = 302;
      set.headers.location = url;
    },
    {
      query: GitHubAuthQuerySchema,
      detail: {
        operationId: "initiateGithubOAuth",
        summary: "Initiate GitHub OAuth",
        description:
          "Redirect the user to GitHub's OAuth authorization page to begin the login flow. An optional `redirect` path is carried through the round-trip and returned to after sign-in.",
      },
    },
  )
  .get(
    "/github/callback",
    async ({ query, cookie, set }) => {
      const frontendUrl = env.FRONTEND_URL;
      try {
        const result = await githubService.callback(query);
        setAuthCookies(cookie, result);
        set.status = 302;
        set.headers.location = `${frontendUrl}${decodeOAuthState(query.state ?? null) ?? "/overview"}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : "GitHub authentication failed";
        set.status = 302;
        set.headers.location = `${frontendUrl}/login?error=${encodeURIComponent(message)}`;
      }
    },
    {
      query: GitHubCallbackQuerySchema,
      detail: {
        operationId: "githubOAuthCallback",
        summary: "GitHub OAuth callback",
        description:
          "Handle the OAuth callback from GitHub. Sets auth cookies and redirects to the frontend, honoring the return path carried in `state`.",
      },
    },
  )

  .post("/device-codes", () => deviceCodeService.createDeviceCode(), {
    rateLimit: { max: 5, windowMs: HOUR_MS },
    response: { 200: DeviceCodeResponseSchema, ...TooManyRequestsErrorSchema },
    detail: {
      operationId: "createDeviceCode",
      summary: "Request a device verification code for CLI login",
      description:
        "Generate a device code pair for the CLI device authorization flow. The CLI displays the user code and polls for completion.",
    },
  })
  .post("/device-codes/token", ({ body }) => deviceCodeService.pollDeviceCode(body.deviceCode), {
    body: DeviceTokenBodySchema,
    // CLI polls every 5s (~12/min): headroom so polling never trips it
    rateLimit: { max: 40, windowMs: MINUTE_MS },
    response: { 200: DeviceTokenResponseSchema, ...TooManyRequestsErrorSchema },
    detail: {
      operationId: "pollDeviceToken",
      summary: "Poll for device code authorization status",
      description:
        "Check whether the user has verified the device code. Returns tokens once verified, or pending/expired status.",
    },
  })
  .use(authGuard)
  .post(
    "/device-codes/verify",
    ({ body, user }) => deviceCodeService.verifyDeviceCode(body.userCode, user.id),
    {
      body: DeviceVerifyBodySchema,
      response: MessageResponseSchema,
      detail: {
        operationId: "verifyDeviceCode",
        summary: "Verify a device code",
        description: "Authorize a CLI device by confirming the user code. Requires authentication.",
        security: [{ bearerAuth: [] }],
      },
    },
  );
