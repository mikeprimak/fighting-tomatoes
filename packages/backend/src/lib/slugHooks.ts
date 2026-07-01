/**
 * Auto-populate SEO `slug` on Fighter / Event / Fight at creation time.
 * See docs/plans/programmatic-seo-2026-07-01.md (step 1 follow-up).
 *
 * WHY A MIDDLEWARE (not per-call-site wiring):
 * Rows are created from ~15+ scattered scraper parsers plus central helpers
 * (utils/fightUpsert.ts, utils/fighterMatcher.ts) and live trackers. Wiring each
 * call site would be error-prone and drift over time. A single `$use` middleware
 * is one well-tested chokepoint that also covers future code — and it never
 * touches the delicate swap-aware / bleed-guard upsert logic, it only fills in a
 * `slug` field the create branch left empty.
 *
 * We use `$use` (legacy but stable in Prisma 5.x) rather than `$extends` so the
 * exported singleton stays typed as `PrismaClient` — the whole codebase (and
 * `fastify.prisma`) depends on that type.
 *
 * Uniqueness: computed against existing slugs (same base prefix) via
 * ensureUniqueSlug; the DB UNIQUE index is the hard backstop. On the rare race
 * where a concurrent create grabs the same slug (P2002 on the slug column) we
 * recompute and retry so the create still succeeds. Any other P2002 (e.g. the
 * eventId+fighter unique constraint) is rethrown immediately — unchanged behavior.
 */
import type { PrismaClient } from '@prisma/client';
import { fighterSlugBase, eventSlugBase, fightSlugBase, ensureUniqueSlug } from './slug';

const SLUG_MODELS = new Set(['Fighter', 'Event', 'Fight']);

function isSlugConflict(e: any): boolean {
  if (e?.code !== 'P2002') return false;
  const t = e?.meta?.target;
  if (Array.isArray(t)) return t.some((x: any) => String(x).includes('slug'));
  return typeof t === 'string' && t.includes('slug');
}

/** Compute the base (pre-uniqueness) slug for a model's create data, or null if
 *  the data doesn't carry enough to derive one (leave slug null; a backfill can
 *  fill it later rather than crashing a scrape). */
async function baseSlugFor(prisma: PrismaClient, model: string, data: any): Promise<string | null> {
  if (model === 'Fighter') {
    if (!data.firstName && !data.lastName) return null;
    return fighterSlugBase({ firstName: data.firstName ?? '', lastName: data.lastName ?? '' });
  }
  if (model === 'Event') {
    if (!data.name) return null;
    return eventSlugBase({ name: data.name });
  }
  if (model === 'Fight') {
    // Unchecked create passes scalar FKs; checked create uses nested connect.
    const id1 = data.fighter1Id ?? data.fighter1?.connect?.id;
    const id2 = data.fighter2Id ?? data.fighter2?.connect?.id;
    if (!id1 || !id2) return null;
    const [f1, f2] = await Promise.all([
      prisma.fighter.findUnique({ where: { id: id1 }, select: { firstName: true, lastName: true } }),
      prisma.fighter.findUnique({ where: { id: id2 }, select: { firstName: true, lastName: true } }),
    ]);
    if (!f1 || !f2) return null;
    return fightSlugBase({ fighter1: f1, fighter2: f2 });
  }
  return null;
}

async function computeUniqueSlug(prisma: PrismaClient, model: string, base: string): Promise<string> {
  const delegate = (prisma as any)[model.toLowerCase()];
  const rows: Array<{ slug: string | null }> = await delegate.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const taken = new Set(rows.map((r) => r.slug).filter(Boolean) as string[]);
  return ensureUniqueSlug(base, taken);
}

export function attachSlugMiddleware(prisma: PrismaClient): void {
  prisma.$use(async (params, next) => {
    const model = params.model;
    if (!model || !SLUG_MODELS.has(model)) return next(params);
    if (params.action !== 'create' && params.action !== 'upsert') return next(params);

    const dataKey = params.action === 'create' ? 'data' : 'create';
    const data = params.args?.[dataKey];
    // No data, an array (createMany — unused for these models), or a slug already
    // set explicitly → leave it alone.
    if (!data || Array.isArray(data) || data.slug) return next(params);

    let base: string | null = null;
    try {
      base = await baseSlugFor(prisma, model, data);
    } catch {
      base = null;
    }
    if (!base) return next(params); // can't derive — leave slug null

    let candidate = await computeUniqueSlug(prisma, model, base);
    for (let attempt = 0; ; attempt++) {
      data.slug = candidate;
      try {
        return await next(params);
      } catch (e) {
        if (isSlugConflict(e) && attempt < 4) {
          // Lost a race for this slug — recompute against the latest state, and
          // guarantee forward progress if the recompute yields the same value.
          const recomputed = await computeUniqueSlug(prisma, model, base);
          candidate = recomputed === candidate ? `${base}-${attempt + 2}-${Math.floor(Math.random() * 1e4)}` : recomputed;
          continue;
        }
        throw e;
      }
    }
  });
}
