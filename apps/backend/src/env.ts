import { Value } from "@sinclair/typebox/value";
import { type Static, t } from "elysia";

const envSchema = t.Object({
  DATABASE_URL: t.String(),
  JWT_SECRET: t.String(),
  JWT_EXPIRY: t.String({ default: "1d" }),
  REFRESH_TOKEN_EXPIRY: t.String({ default: "7d" }),
  PORT: t.String({ default: "4000" }),
  NODE_ENV: t.Optional(
    t.Union([
      t.Literal("development"),
      t.Literal("production"),
      t.Literal("staging"),
      t.Literal("test"),
    ]),
  ),
  CORS_ORIGINS: t.String({ default: "http://localhost:4001" }),
  LOG_LEVEL: t.String({ default: "info" }),
  UPLOAD_DIR: t.String({ default: "./uploads" }),
  ADMIN_EMAIL: t.Optional(t.String()),
  ADMIN_PASSWORD: t.Optional(t.String()),
  GITHUB_CLIENT_ID: t.Optional(t.String()),
  GITHUB_CLIENT_SECRET: t.Optional(t.String()),
  GITHUB_CALLBACK_URL: t.String({ default: "http://localhost:4000/api/auth/github/callback" }),
  RESEND_API_KEY: t.Optional(t.String()),
  EMAIL_FROM_NAME: t.String({ default: "DepVault" }),
  EMAIL_FROM_ADDRESS: t.String({ default: "noreply@depvault.com" }),
  FRONTEND_URL: t.String({ default: "http://localhost:4001" }),
  STRIPE_SECRET_KEY: t.Optional(t.String()),
  STRIPE_WEBHOOK_SECRET: t.Optional(t.String()),
  STRIPE_API_VERSION: t.Optional(t.String()),
  TURNSTILE_SECRET_KEY: t.Optional(t.String()),
});

type Env = Static<typeof envSchema>;

const parseEnv = (): Env => {
  const converted = Value.Convert(envSchema, { ...process.env });
  const parsed = Value.Default(envSchema, Value.Clean(envSchema, converted));
  const errors = [...Value.Errors(envSchema, parsed)];

  if (errors.length > 0) {
    const details = errors.map((e) => `  - ${e.path.replace("/", "")}: ${e.message}`).join("\n");
    throw new Error(`Environment validation failed:\n${details}`);
  }

  return parsed as Env;
};

/**
 * Typed environment with defaults applied, validated once at import so every importer (app,
 * scripts, jobs) fails fast on missing required values. Tests override fields on this object.
 */
export const env: Env = parseEnv();
