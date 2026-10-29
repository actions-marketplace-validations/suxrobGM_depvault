import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { env } from "@/env";

/** CORS configuration plugin. */
export const corsPlugin = new Elysia({ name: "cors" }).use(
  cors({
    origin: env.CORS_ORIGINS.split(","),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);
