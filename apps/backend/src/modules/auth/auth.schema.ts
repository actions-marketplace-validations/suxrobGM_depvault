import { type Static, t } from "elysia";

export const RegisterBodySchema = t.Object({
  email: t.String({ format: "email" }),
  firstName: t.String({ minLength: 1, maxLength: 50 }),
  lastName: t.String({ minLength: 1, maxLength: 50 }),
  password: t.String({ minLength: 8, maxLength: 128 }),
  inviteToken: t.Optional(t.String()),
});

export const LoginBodySchema = t.Object({
  email: t.String({ format: "email" }),
  password: t.String(),
});

export const ForgotPasswordBodySchema = t.Object({
  email: t.String({ format: "email" }),
});

export const ResetPasswordBodySchema = t.Object({
  token: t.String(),
  password: t.String({ minLength: 8, maxLength: 128 }),
});

export const VerifyEmailBodySchema = t.Object({
  token: t.String(),
});

const AuthUserSchema = t.Object({
  id: t.String(),
  email: t.String(),
  firstName: t.String(),
  lastName: t.String(),
  role: t.String(),
  emailVerified: t.Boolean(),
  avatarUrl: t.Nullable(t.String()),
});

export const AuthResponseSchema = t.Object({
  accessToken: t.String(),
  refreshToken: t.String(),
  user: AuthUserSchema,
});

export const GitHubAuthQuerySchema = t.Object({
  redirect: t.Optional(t.String()),
});

export const GitHubCallbackQuerySchema = t.Object({
  code: t.String(),
  state: t.Optional(t.String()),
});

export const DeviceCodeResponseSchema = t.Object({
  deviceCode: t.String(),
  userCode: t.String(),
  verificationUrl: t.String(),
  expiresIn: t.Number(),
});

export const DeviceTokenBodySchema = t.Object({
  deviceCode: t.String(),
});

export const DeviceTokenResponseSchema = t.Object({
  status: t.Union([t.Literal("pending"), t.Literal("verified"), t.Literal("expired")]),
  accessToken: t.Optional(t.String()),
  refreshToken: t.Optional(t.String()),
  user: t.Optional(AuthUserSchema),
});

export const DeviceVerifyBodySchema = t.Object({
  userCode: t.String({ minLength: 1 }),
});

export type RegisterBody = Static<typeof RegisterBodySchema>;
export type LoginBody = Static<typeof LoginBodySchema>;
export type ForgotPasswordBody = Static<typeof ForgotPasswordBodySchema>;
export type ResetPasswordBody = Static<typeof ResetPasswordBodySchema>;
export type VerifyEmailBody = Static<typeof VerifyEmailBodySchema>;
export type AuthResponse = Static<typeof AuthResponseSchema>;
export type GitHubCallbackQuery = Static<typeof GitHubCallbackQuerySchema>;
