/**
 * Single-event POST-fight enrichment primitive.
 *
 * Sibling to enrichOneEvent.ts. Flow:
 *   1. Load the COMPLETED card (with recorded outcomes) from the DB — authoritative.
 *   2. Fetch post-event editorial (Brave, recap mode) + optional structured page
 *      text (UFC.com / Tapology / BKFC) as ADDITIONAL recap material.
 *   3. Send {card-with-results, sources} to the LLM. It writes a grounded recap
 *      per fightId, never overriding the recorded result.
 *   4. Write straight back onto the aiPostFight* columns by fightId.
 *
 * Reuses the existing pre-fight fetchers (fetchUFCEventPreview / Tapology / BKFC /
 * Editorial) directly — they are promotion-page / search fetchers and are
 * direction-agnostic. Only the editorial fetch flips to mode:'recap'.
 */

import { PrismaClient } from '@prisma/client';
import {
  fetchUFCEventPreview,
  type PreviewBrowserHandle,
} from '../fetchUFCEventPreview';
import { fetchTapologyEventPreview } from '../fetchTapologyEventPreview';
import { fetchBkfcEventPreview } from '../fetchBkfcEventPreview';
import { fetchEditorialPreviews } from '../fetchEditorialPreviews';
import {
  extractPostFightEnrichment,
  type PostFightCardItem,
} from './extractPostFightEnrichment';
import {
  persistPostFightEnrichment,
  type PersistPostFightResult,
} from './persistPostFight';

// Haiku 4.5 prices per 1M tokens (2026-01). Mirrors enrichOneEvent.ts.
const PRICE_INPUT_PER_MTOK = 1.0;
const PRICE_CACHE_WRITE_PER_MTOK = 1.25;
const PRICE_CACHE_READ_PER_MTOK = 0.1;
const PRICE_OUTPUT_PER_MTOK = 5.0;

/**
 * How many bouts per event may carry pundit quotes, taken from the top of the
 * card by orderOnCard (1 = main event). Quote density collapses below the
 * co-main even on a big PPV, and the >=2-quote display gate would hide most of
 * what a wider pass produced — so the extra extract tokens buy nothing. Raise
 * if aggregator coverage of undercard moments proves richer than expected.
 */
const PUNDIT_QUOTES_MAX_BOUTS_PER_EVENT = Number(
  process.env.PUNDIT_QUOTES_MAX_BOUTS_PER_EVENT ?? 2,
);

export interface EnrichOnePostFightOptions {
  dryRun?: boolean;
  browserHandle?: PreviewBrowserHandle;
  editorialTopN?: number;
  /** Brave freshness for the editorial recap search. The T+5d cron keeps the
   *  default ('pm'); the historic backfill passes 'all' because its recaps are
   *  years old. */
  editorialFreshness?: 'pd' | 'pw' | 'pm' | 'py' | 'all';
}

export interface EnrichOnePostFightResult {
  eventId: string;
  eventName: string;
  promotion: string;
  cardSize: number;          // COMPLETED fights with a result needing enrichment
  sourcesFetched: Array<{ url: string; chars: number; label: string }>;
  fightsEnriched: number;    // LLM returned a record we could write
  wroteCount: number;
  skippedLowConfidence: number;
  uncoveredFightIds: string[];
  ghostFightIds: string[];
  costUsd: number;
  elapsedMs: number;
  persistResult: PersistPostFightResult;
  /** fightIds that were allowed to carry pundit quotes this run. */
  quoteEligibleFightIds: string[];
  abortedReason?: string;
}

const EMPTY_PERSIST: PersistPostFightResult = {
  wroteCount: 0,
  writtenFightIds: [],
  skippedLowConfidence: [],
  skippedEmpty: [],
  uncoveredFightIds: [],
  punditQuotes: { proposed: 0, verified: 0, written: 0, rejected: [], skippedExcluded: 0 },
};

export async function enrichOnePostFightEvent(
  prisma: PrismaClient,
  eventId: string,
  opts: EnrichOnePostFightOptions = {},
): Promise<EnrichOnePostFightResult> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error(`Event ${eventId} not found`);

  // Fights still needing a recap. Quote targets are computed separately against
  // the WHOLE card (below) — the top of the card is usually recapped first, so
  // deriving quote eligibility from this pending subset would slide the "main
  // event + co-main" scope down onto prelims on any event Phase 6 already ran.
  const pendingCard = await loadCompletedCard(prisma, eventId);
  const quoteTargets = await loadQuoteTargets(
    prisma,
    eventId,
    PUNDIT_QUOTES_MAX_BOUTS_PER_EVENT,
  );

  // A quote target that's already recapped still has to appear in the CARD we
  // send, or the model has no fightId to hang its quotes on. It is flagged
  // recap-only-exempt so persistence can't overwrite the existing recap.
  const pendingIds = new Set(pendingCard.map((c) => c.fightId));
  const card = [...pendingCard, ...quoteTargets.filter((t) => !pendingIds.has(t.fightId))]
    .sort((a, b) => (a.orderOnCard ?? 999) - (b.orderOnCard ?? 999));
  const quoteEligibleFightIds = quoteTargets.map((t) => t.fightId);

  const base = {
    eventId: event.id,
    eventName: event.name,
    promotion: event.promotion,
    cardSize: pendingCard.length,
  };

  if (card.length === 0) {
    return {
      ...base,
      sourcesFetched: [],
      fightsEnriched: 0,
      wroteCount: 0,
      skippedLowConfidence: 0,
      uncoveredFightIds: [],
      ghostFightIds: [],
      costUsd: 0,
      elapsedMs: 0,
      persistResult: EMPTY_PERSIST,
      quoteEligibleFightIds: [],
      abortedReason: 'no_completed_fights_needing_recap',
    };
  }

  const sourceUrl = event.ufcUrl ?? '';
  const isUfcCom = /(^|\.)ufc\.com\b/i.test(sourceUrl);
  const isTapology = /(^|\.)tapology\.com\b/i.test(sourceUrl);
  const isBkfcCom = /(^|\.)bkfc\.com\b/i.test(sourceUrl);
  const editorialTopN = opts.editorialTopN ?? 3;

  const sources: Array<{ url: string; text: string; label?: string }> = [];
  const sourcesFetched: EnrichOnePostFightResult['sourcesFetched'] = [];

  // Structured promotion-page text as supplementary recap material. The
  // promotion's own event page often carries final results post-event.
  if (isUfcCom && opts.browserHandle) {
    const snap = await fetchUFCEventPreview(sourceUrl, opts.browserHandle);
    if (snap) {
      sources.push({ url: snap.finalUrl, text: snap.text, label: 'ufc.com' });
      sourcesFetched.push({ url: snap.finalUrl, chars: snap.text.length, label: 'ufc.com' });
    }
  } else if (isTapology) {
    const snap = await fetchTapologyEventPreview(sourceUrl);
    if (snap) {
      sources.push({ url: snap.finalUrl, text: snap.text, label: 'tapology.com' });
      sourcesFetched.push({ url: snap.finalUrl, chars: snap.text.length, label: 'tapology.com' });
    }
  } else if (isBkfcCom) {
    const snap = await fetchBkfcEventPreview(sourceUrl);
    if (snap) {
      sources.push({ url: snap.finalUrl, text: snap.text, label: 'bkfc.com' });
      sourcesFetched.push({ url: snap.finalUrl, chars: snap.text.length, label: 'bkfc.com' });
    }
  }

  // Editorial recap — applies to every promotion. mode:'recap' biases Brave
  // toward results/recap articles instead of previews.
  const editorial = await fetchEditorialPreviews(event.name, undefined, {
    topN: editorialTopN,
    mode: 'recap',
    freshness: opts.editorialFreshness,
  });
  for (const s of editorial) {
    sources.push({ url: s.url, text: s.text, label: s.domain });
    sourcesFetched.push({ url: s.url, chars: s.text.length, label: s.domain });
  }

  // Media-reaction pass — one extra Brave query whose results are only partially
  // disjoint from the recap set (play-by-play writeups rarely quote analysts).
  // This is what feeds the pundit-quote strip; recaps alone under-serve it.
  if (quoteEligibleFightIds.length > 0) {
    const seenUrls = new Set(sources.map((s) => s.url));
    const reaction = await fetchEditorialPreviews(event.name, undefined, {
      topN: 4,
      mode: 'reaction',
      freshness: opts.editorialFreshness,
    });
    for (const s of reaction) {
      if (seenUrls.has(s.url)) continue; // already fetched by the recap pass
      seenUrls.add(s.url);
      sources.push({ url: s.url, text: s.text, label: `${s.domain} (reaction)` });
      sourcesFetched.push({ url: s.url, chars: s.text.length, label: `${s.domain} (reaction)` });
    }
  }

  if (sources.length === 0) {
    return {
      ...base,
      sourcesFetched: [],
      fightsEnriched: 0,
      wroteCount: 0,
      skippedLowConfidence: 0,
      uncoveredFightIds: card.map((c) => c.fightId),
      ghostFightIds: [],
      costUsd: 0,
      elapsedMs: 0,
      persistResult: { ...EMPTY_PERSIST, uncoveredFightIds: card.map((c) => c.fightId) },
      quoteEligibleFightIds: [],
      abortedReason: 'no_sources',
    };
  }

  const t0 = Date.now();
  const result = await extractPostFightEnrichment({
    promotion: event.promotion,
    eventName: event.name,
    eventDate: event.date.toISOString().slice(0, 10),
    card,
    sources,
    quoteEligibleFightIds,
  });
  const elapsedMs = Date.now() - t0;

  const u = result.usage;
  const costUsd =
    (u.inputTokens / 1_000_000) * PRICE_INPUT_PER_MTOK +
    (u.cacheCreationInputTokens / 1_000_000) * PRICE_CACHE_WRITE_PER_MTOK +
    (u.cacheReadInputTokens / 1_000_000) * PRICE_CACHE_READ_PER_MTOK +
    (u.outputTokens / 1_000_000) * PRICE_OUTPUT_PER_MTOK;

  const persistResult = await persistPostFightEnrichment(
    prisma,
    card,
    result.fights,
    sources.map((s) => s.url),
    // Pass the fetched text through so quotes can be verified verbatim against
    // the article they claim to come from. Without it, quotes are dropped.
    {
      dryRun: !!opts.dryRun,
      sources: sources.map((s) => ({ url: s.url, text: s.text })),
      // Quote-only fights are in the card so they can be quoted; their recaps
      // already exist and must not be rewritten.
      recapEligibleFightIds: pendingIds,
    },
  );

  return {
    ...base,
    sourcesFetched,
    fightsEnriched: result.fights.length,
    wroteCount: persistResult.wroteCount,
    skippedLowConfidence: persistResult.skippedLowConfidence.length,
    uncoveredFightIds: persistResult.uncoveredFightIds,
    ghostFightIds: result.ghostFightIds,
    costUsd,
    elapsedMs,
    persistResult,
    quoteEligibleFightIds,
  };
}

/**
 * Load COMPLETED fights that have a recorded result and don't yet have a
 * post-fight recap. A fight with no winner recorded (e.g. cancelled, NC with no
 * detail) is skipped — there's nothing to recap.
 */
async function loadCompletedCard(
  prisma: PrismaClient,
  eventId: string,
): Promise<PostFightCardItem[]> {
  const fights = await prisma.fight.findMany({
    where: {
      eventId,
      fightStatus: 'COMPLETED',
      aiPostFightEnrichedAt: null,
      winner: { not: null },
    },
    include: {
      fighter1: { select: { id: true, firstName: true, lastName: true } },
      fighter2: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { orderOnCard: 'asc' },
  });

  return fights.map(toCardItem);
}

type CardFightRow = {
  id: string;
  weightClass: string | null;
  cardType: string | null;
  orderOnCard: number | null;
  isTitle: boolean;
  winner: string | null;
  method: string | null;
  round: number | null;
  time: string | null;
  fighter1: { id: string; firstName: string; lastName: string };
  fighter2: { id: string; firstName: string; lastName: string };
};

function toCardItem(f: CardFightRow): PostFightCardItem {
  return {
    fightId: f.id,
    fighter1: fullName(f.fighter1),
    fighter2: fullName(f.fighter2),
    weightClass: f.weightClass ?? null,
    cardSection: normalizeCardSection(f.cardType),
    orderOnCard: f.orderOnCard ?? null,
    isMainEvent: f.orderOnCard === 1,
    isTitle: !!f.isTitle,
    winnerName: resolveWinner(f),
    method: f.method ?? null,
    round: f.round ?? null,
    time: f.time ?? null,
  };
}

/**
 * The bouts allowed to carry pundit quotes: the top `maxBouts` of the FULL
 * completed card by orderOnCard (1 = main event), skipping any that already
 * have quotes stored so a re-run doesn't re-pay for extraction.
 *
 * Deliberately independent of aiPostFightEnrichedAt — a fight recapped on an
 * earlier pass can still be missing quotes, and the main event is exactly the
 * fight most likely to be in that state.
 */
async function loadQuoteTargets(
  prisma: PrismaClient,
  eventId: string,
  maxBouts: number,
): Promise<PostFightCardItem[]> {
  if (maxBouts <= 0) return [];

  const fights = await prisma.fight.findMany({
    where: {
      eventId,
      fightStatus: 'COMPLETED',
      winner: { not: null },
    },
    include: {
      fighter1: { select: { id: true, firstName: true, lastName: true } },
      fighter2: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { punditQuotes: true } },
    },
    orderBy: { orderOnCard: 'asc' },
    take: maxBouts,
  });

  return fights
    .filter((f) => f._count.punditQuotes === 0)
    .map(toCardItem);
}

function resolveWinner(f: {
  winner: string | null;
  fighter1: { id: string; firstName: string; lastName: string };
  fighter2: { id: string; firstName: string; lastName: string };
}): string | null {
  if (!f.winner) return null;
  if (f.winner === f.fighter1.id) return fullName(f.fighter1);
  if (f.winner === f.fighter2.id) return fullName(f.fighter2);
  const w = f.winner.toLowerCase();
  if (w === 'draw') return 'Draw';
  if (w === 'nc' || w === 'no contest') return 'No Contest';
  return null;
}

function normalizeCardSection(cardType: string | null): string | null {
  if (!cardType) return null;
  const t = cardType.toLowerCase().trim();
  if (t.includes('early')) return 'EARLY_PRELIMS';
  if (t.includes('prelim')) return 'PRELIMS';
  if (t.includes('main')) return 'MAIN_CARD';
  return null;
}

function fullName(f: { firstName: string; lastName: string }): string {
  return `${f.firstName} ${f.lastName}`.trim();
}
