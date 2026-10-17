import pino from "pino";
import { sanitizeObject } from "@/common/utils/log-sanitizer";
import { env } from "@/env";

export const logger = pino({
  level: env.LOG_LEVEL,
  hooks: {
    logMethod(inputArgs, method) {
      const sanitized = inputArgs.map((arg) =>
        typeof arg === "object" && arg !== null ? sanitizeObject(arg) : arg,
      );
      return method.apply(this, sanitized as Parameters<typeof method>);
    },
  },
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});
