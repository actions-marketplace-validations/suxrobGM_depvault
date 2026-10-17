import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { staticPlugin } from "@elysiajs/static";
import { Elysia } from "elysia";
import { env } from "@/env";

const UPLOADS_DIR = resolve(env.UPLOAD_DIR);
mkdirSync(UPLOADS_DIR, { recursive: true });

/** Serves the uploads directory; must be registered outside the API_PREFIX group. */
export const uploadsStaticPlugin = new Elysia({ name: "static" }).use(
  staticPlugin({
    assets: UPLOADS_DIR,
    prefix: "/uploads",
  }),
);
