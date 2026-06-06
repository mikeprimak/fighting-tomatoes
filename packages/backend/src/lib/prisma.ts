import { PrismaClient } from '@prisma/client';

/**
 * Shared PrismaClient singleton.
 *
 * WHY THIS EXISTS (2026-06-06 DB crash-loop incident):
 * The backend used to call `new PrismaClient()` in ~50 route/service/parser
 * modules. Each PrismaClient opens its OWN connection pool, and Prisma's default
 * pool size is (cpus * 2 + 1) PER client. All of those modules load into the one
 * long-running server process, so on a busy fight night (lifecycle + scrapers +
 * live trackers + API traffic, incl. the new web Home `/api/events?includeFights`)
 * the process marched toward Render Postgres's `max_connections` (103), exhausted
 * connections, and crash-looped the DB. Routing every module through ONE
 * connection-limited client fixes that at the source.
 *
 * See docs/daily/2026-06-06.md ("INCIDENT — Render Postgres crash-loop").
 */

const CONNECTION_LIMIT = Number(process.env.PRISMA_CONNECTION_LIMIT ?? 10);
const POOL_TIMEOUT = Number(process.env.PRISMA_POOL_TIMEOUT ?? 20);

/**
 * Bound the pool deterministically by appending `connection_limit` to the URL,
 * regardless of how many CPUs Prisma thinks the container has. An operator can
 * still override by putting `connection_limit=` directly on DATABASE_URL.
 */
function buildUrl(): string | undefined {
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;
  if (base.includes('connection_limit=')) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}connection_limit=${CONNECTION_LIMIT}&pool_timeout=${POOL_TIMEOUT}`;
}

const url = buildUrl();

// Guard against duplicate module evaluation (e.g. dev hot-reload, or the module
// being resolved via two paths) creating more than one pool per process.
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__prisma ??
  new PrismaClient(url ? { datasources: { db: { url } } } : undefined);

globalForPrisma.__prisma = prisma;
