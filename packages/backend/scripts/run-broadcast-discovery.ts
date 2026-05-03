/**
 * Wrapper for the GitHub Actions / ad-hoc broadcast discovery run.
 * Reads optional env knobs and forwards to runDiscovery().
 *
 * Env:
 *   DISCOVERY_PROMOTIONS   — comma-separated promotion list (empty = all active)
 *   DISCOVERY_REGIONS      — comma-separated region list (empty = all six)
 *   DISCOVERY_SKIP_FRESH_DAYS — skip if existing default verified within N days
 *   DISCOVERY_MAX_QUERIES  — global Brave cap (default 200)
 *   BRAVE_API_KEY, ANTHROPIC_API_KEY — required for real runs
 *   DATABASE_URL           — Render external URL
 */

import { PrismaClient } from '@prisma/client';
import { runDiscovery } from '../src/services/broadcastDiscovery/run';

const REGIONS = ['US', 'CA', 'GB', 'AU', 'NZ', 'EU'] as const;
type Region = typeof REGIONS[number];

function csv(name: string): string[] | undefined {
  const v = process.env[name];
  if (!v || !v.trim()) return undefined;
  return v.split(',').map(s => s.trim()).filter(Boolean);
}

(async () => {
  const prisma = new PrismaClient();
  const regionsList = csv('DISCOVERY_REGIONS');
  const regions = regionsList
    ? (regionsList.filter(r => (REGIONS as readonly string[]).includes(r)) as Region[])
    : undefined;
  const skipFreshDays = process.env.DISCOVERY_SKIP_FRESH_DAYS
    ? parseInt(process.env.DISCOVERY_SKIP_FRESH_DAYS, 10)
    : undefined;
  const maxQueries = process.env.DISCOVERY_MAX_QUERIES
    ? parseInt(process.env.DISCOVERY_MAX_QUERIES, 10)
    : undefined;

  try {
    const summary = await runDiscovery(prisma, {
      promotions: csv('DISCOVERY_PROMOTIONS'),
      regions,
      skipFreshDays,
      maxQueries,
    });
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.errors.length > 0 ? 1 : 0);
  } catch (err) {
    console.error('[run-broadcast-discovery] fatal:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
