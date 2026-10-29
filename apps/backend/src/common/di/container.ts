import { Container } from "@needle-di/core";
import { prisma } from "@/common/database/prisma.client";
import { PrismaClient } from "@/generated/prisma";

/** App-wide DI container: `@injectable()` classes resolve as singletons; Prisma is the shared client. */
export const container = new Container().bind({ provide: PrismaClient, useValue: prisma });
