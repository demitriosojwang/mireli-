import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma client for the driver service.
 *
 * Reuses the instance across hot reloads in development. Without this, every
 * file change in `next dev` opens a new connection pool, and SQLite locks
 * ("database is locked") appear under even modest load.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;