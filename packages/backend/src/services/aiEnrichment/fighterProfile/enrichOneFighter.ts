/**
 * Single-fighter profile enrichment primitive.
 *
 * Sibling to enrichOneEvent.ts / enrichOnePostFightEvent.ts. Flow:
 *   1. Load the fighter (authoritative identity + record) and their COMPLETED
 *      fights (to ground signatureFights) from the DB.
 *   2. Fetch biographical sources (UFC athlete page + Wikipedia + editorial).
 *   3. Send {identity, notableFights, sources} to the LLM, which writes a
 *      grounded profile + long-form summary, never contradicting the record.
 *   4. Write back onto the aiProfile* columns (confidence-gated).
 */

import { PrismaClient } from '@prisma/client';
import type { Browser } from 'puppeteer';
import { fetchFighterBio } from './fetchFighterBio';
import {
  extractFighterProfile,
  type NotableFight,
} from './extractFighterProfile';
import {
  persistFighterProfile,
  fighterRecordKey,
  type PersistFighterProfileOutcome,
} from './persistFighterProfile';

// Haiku 4.5 prices per 1M tokens (2026-01). Mirrors enrichOnePostFightEvent.ts.
const PRICE_INPUT_PER_MTOK = 1.0;
const PRICE_CACHE_WRITE_PER_MTOK = 1.25;
const PRICE_CACHE_READ_PER_MTOK = 0.1;
const PRICE_OUTPUT_PER_MTOK = 5.0;

const MAX_NOTABLE_FIGHTS = 20;

export interface EnrichOneFighterOptions {
  dryRun?: boolean;
  /** Reused stealth browser for ufc.com athlete pages. */
  browser?: Browser;
  minConfidence?: number;
}

export interface EnrichOneFighterResult {
  fighterId: string;
  name: string;
  sourcesFetched: Array<{ label: string; ok: boolean; chars: number }>;
  confidence: number | null;
  persistOutcome: PersistFighterProfileOutcome | null;
  costUsd: number;
  elapsedMs: number;
  abortedReason?: string;
}

export async function enrichOneFighter(
  prisma: PrismaClient,
  fighterId: string,
  opts: EnrichOneFighterOptions = {},
): Promise<EnrichOneFighterResult> {
  const fighter = await prisma.fighter.findUnique({ where: { id: fighterId } });
  if (!fighter) throw new Error(`Fighter ${fighterId} not found`);

  const name = `${fighter.firstName} ${fighter.lastName}`.trim();
  const base = { fighterId, name };

  // 1. Sources.
  const bio = await fetchFighterBio(
    {
      firstName: fighter.firstName,
      lastName: fighter.lastName,
      nickname: fighter.nickname,
      ufcAthleteSlug: fighter.ufcAthleteSlug,
      sport: fighter.sport,
    },
    { browser: opts.browser },
  );

  const sourcesFetched = bio.attempted.map((a) => ({ label: a.label, ok: a.ok, chars: a.chars }));

  if (bio.sources.length === 0) {
    return {
      ...base,
      sourcesFetched,
      confidence: null,
      persistOutcome: null,
      costUsd: 0,
      elapsedMs: 0,
      abortedReason: 'no_sources',
    };
  }

  // 2. Notable fights from the DB to ground signatureFights.
  const notableFights = await loadNotableFights(prisma, fighter.id);

  const nc = fighter.noContests;
  const hasRecord = fighter.wins + fighter.losses + fighter.draws + nc > 0;
  const recordDisplay = hasRecord
    ? `${fighter.wins}-${fighter.losses}-${fighter.draws}` + (nc > 0 ? ` (${nc} NC)` : '')
    : null;

  // 3. Extract.
  const t0 = Date.now();
  const result = await extractFighterProfile({
    identity: {
      fighterId: fighter.id,
      firstName: fighter.firstName,
      lastName: fighter.lastName,
      nickname: fighter.nickname,
      record: recordDisplay,
      weightClass: prettyWeightClass(fighter.weightClass),
      rank: fighter.rank,
      isChampion: fighter.isChampion,
      championshipTitle: fighter.championshipTitle,
      sport: fighter.sport,
      isActive: fighter.isActive,
    },
    notableFights,
    sources: bio.sources,
  });
  const elapsedMs = Date.now() - t0;

  const u = result.usage;
  const costUsd =
    (u.inputTokens / 1_000_000) * PRICE_INPUT_PER_MTOK +
    (u.cacheCreationInputTokens / 1_000_000) * PRICE_CACHE_WRITE_PER_MTOK +
    (u.cacheReadInputTokens / 1_000_000) * PRICE_CACHE_READ_PER_MTOK +
    (u.outputTokens / 1_000_000) * PRICE_OUTPUT_PER_MTOK;

  if (!result.record) {
    return {
      ...base,
      sourcesFetched,
      confidence: null,
      persistOutcome: null,
      costUsd,
      elapsedMs,
      abortedReason: 'no_parseable_profile',
    };
  }

  // 4. Persist.
  const persistOutcome = await persistFighterProfile(
    prisma,
    fighter.id,
    result.record,
    bio.sources.map((s) => s.url),
    fighterRecordKey(fighter),
    'cron-haiku',
    { dryRun: !!opts.dryRun, minConfidence: opts.minConfidence },
  );

  return {
    ...base,
    sourcesFetched,
    confidence: result.record.confidence,
    persistOutcome,
    costUsd,
    elapsedMs,
  };
}

/**
 * Load the fighter's COMPLETED, resolved fights, framed from THIS fighter's
 * perspective (Win/Loss/Draw), most recent first, capped.
 */
async function loadNotableFights(prisma: PrismaClient, fighterId: string): Promise<NotableFight[]> {
  const fights = await prisma.fight.findMany({
    where: {
      fightStatus: 'COMPLETED',
      winner: { not: null },
      OR: [{ fighter1Id: fighterId }, { fighter2Id: fighterId }],
    },
    include: {
      fighter1: { select: { id: true, firstName: true, lastName: true } },
      fighter2: { select: { id: true, firstName: true, lastName: true } },
      event: { select: { name: true, date: true } },
    },
    orderBy: { event: { date: 'desc' } },
    take: MAX_NOTABLE_FIGHTS,
  });

  return fights.map((f) => {
    const isF1 = f.fighter1Id === fighterId;
    const opp = isF1 ? f.fighter2 : f.fighter1;
    const opponent = `${opp.firstName} ${opp.lastName}`.trim();

    let outcome = 'Result';
    if (f.winner === fighterId) outcome = 'Win';
    else if (f.winner && (f.winner === f.fighter1Id || f.winner === f.fighter2Id)) outcome = 'Loss';
    else if (f.winner?.toLowerCase() === 'draw') outcome = 'Draw';
    else if (f.winner) outcome = 'No Contest';

    const detail = [f.method, f.round != null ? `R${f.round}` : null].filter(Boolean).join(', ');
    const result = detail ? `${outcome} — ${detail}` : outcome;

    return {
      opponent,
      result,
      date: f.event?.date ? f.event.date.toISOString().slice(0, 10) : null,
      event: f.event?.name ?? null,
    };
  });
}

function prettyWeightClass(wc: string | null): string | null {
  if (!wc) return null;
  return wc
    .toLowerCase()
    .split('_')
    .map((w) => (w === 'womens' ? "Women's" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
