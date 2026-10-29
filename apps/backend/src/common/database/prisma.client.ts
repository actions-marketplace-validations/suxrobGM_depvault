import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { env } from "@/env";
import { PrismaClient } from "@/generated/prisma";

const pool = new Pool({ connectionString: env.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === "development" ? ["info", "warn", "error"] : ["warn", "error"],
});
