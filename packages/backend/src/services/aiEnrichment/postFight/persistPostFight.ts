/**
 * Write post-fight enrichment records onto Fight rows by fightId.
 *
 * Mirrors persist.ts (pre-fight), but targets the aiPostFight* columns and is
 * additive — it never touches the pre-fight ai* fields. Only writes records
 * that cleared the confidence floor and carried real narrative (a bare result
 * with no editorial recap should have been omitted upstream, but we guard here
 * too so we never stamp aiPostFightEnrichedAt on an empty record).
 */

import { PrismaClient } from '@prisma/client';
import type {
  PostFightEnrichmentRecord,
  PostFightCardItem,
} from './extractPostFightEnrichment';
import { verifyPunditQuotes, type QuoteRejection } from './verifyPunditQuotes';
import { resolvePundit } from './punditRegistry';

const CONFIDENCE_FLOOR = 0.5;

export interface PersistPostFightOptions {
  dryRun?: boolean;
  /** Records below this confidence are skipped. Default 0.5. */
  minConfidence?: number;
  /**
   * The articles we actually fetched, for the verbatim substring check. Quotes
   * are only persisted when these are supplied — no sources, no verification,
   * no quotes.
   */
  sources?: Array<{ url: string; text: string }>;
  /**
   * Restricts which fightIds may have their aiPostFight* columns written. The
   * card can legitimately contain fights that are present only so they can be
   * QUOTED (their recap already exists) — those must not be overwritten. Omit
   * to allow recap writes for the whole card, the original behavior.
   */
  recapEligibleFightIds?: Set<string>;
}

export interface PersistPunditQuotesSummary {
  /** Quotes the model proposed, after shape parsing. */
  proposed: number;
  /** Quotes that survived the verbatim substring check. */
  verified: number;
  /** Rows actually written (verified minus dedupe collisions and excluded pundits). */
  written: number;
  rejected: QuoteRejection[];
  /** Quotes dropped because the resolved pundit carries excluded: true. */
  skippedExcluded: number;
}

export interface PersistPostFightResult {
  wroteCount: number;
  writtenFightIds: string[];
  skippedLowConfidence: string[];
  skippedEmpty: string[];
  uncoveredFightIds: string[]; // card fightIds with no record at all
  punditQuotes: PersistPunditQuotesSummary;
}

function hasNarrative(rec: PostFightEnrichmentRecord): boolean {
  const t = rec.tags;
  return !!(
    rec.summary ||
    t.methodNarrative ||
    t.momentDescription ||
    t.bonuses.length ||
    t.callouts.length ||
    t.aftermath.length ||
    t.fotyConsideration ||
    // Structured character tags are themselves worth persisting (they feed Fan DNA
    // taste analytics), even when the model produced no prose for this fight.
    t.character
  );
}

export async function persistPostFightEnrichment(
  prisma: PrismaClient,
  card: PostFightCardItem[],
  records: PostFightEnrichmentRecord[],
  sourceUrls: string[],
  opts: PersistPostFightOptions = {},
): Promise<PersistPostFightResult> {
  const minConfidence = opts.minConfidence ?? CONFIDENCE_FLOOR;
  const validIds = new Set(card.map((c) => c.fightId));

  const written: string[] = [];
  const skippedLowConfidence: string[] = [];
  const skippedEmpty: string[] = [];
  const covered = new Set<string>();

  for (const rec of records) {
    if (!validIds.has(rec.fightId)) continue; // already filtered upstream, belt-and-suspenders
    // Quote-only fight: it rides in the card to be quotable, not to be recapped.
    if (opts.recapEligibleFightIds && !opts.recapEligibleFightIds.has(rec.fightId)) continue;
    if (rec.confidence < minConfidence) {
      skippedLowConfidence.push(rec.fightId);
      continue;
    }
    if (!hasNarrative(rec)) {
      skippedEmpty.push(rec.fightId);
      continue;
    }
    covered.add(rec.fightId);
    if (!opts.dryRun) {
      await prisma.fight.update({
        where: { id: rec.fightId },
        data: {
          aiPostFightTags: rec.tags as any,
          aiPostFightSummary: rec.summary || null,
          aiPostFightEnrichedAt: new Date(),
          // Append recap grounding URLs without clobbering the pre-fight
          // sources. Dedup is gated by aiPostFightEnrichedAt upstream, so this
          // appends each URL effectively once per fight.
          aiSourceUrls: { push: Array.from(new Set(sourceUrls.filter(Boolean))) },
        },
      });
    }
    written.push(rec.fightId);
  }

  const uncoveredFightIds = card
    .map((c) => c.fightId)
    // Quote-only fights were never candidates for a recap write, so counting
    // them as "uncovered" would overstate the coverage gap every run.
    .filter((id) => !opts.recapEligibleFightIds || opts.recapEligibleFightIds.has(id))
    .filter((id) => !covered.has(id));

  const punditQuotes = await persistPunditQuotes(prisma, records, validIds, opts);

  return {
    wroteCount: written.length,
    writtenFightIds: written,
    skippedLowConfidence,
    skippedEmpty,
    uncoveredFightIds,
    punditQuotes,
  };
}

/**
 * Verify + write the pundit quotes for a batch of records.
 *
 * Runs independently of the recap confidence gate above: a quote's standing
 * comes from the deterministic substring check, not from how confident the model
 * felt about the surrounding recap. The per-quote confidence is stored and
 * applied at READ time (display floor 0.5), so a borderline quote is kept as
 * data without being shown.
 *
 * Idempotent per (fight, pundit, quoteHash) — the unique index collapses the
 * same line arriving via a second aggregator, so a re-run is a no-op.
 */
async function persistPunditQuotes(
  prisma: PrismaClient,
  records: PostFightEnrichmentRecord[],
  validIds: Set<string>,
  opts: PersistPostFightOptions,
): Promise<PersistPunditQuotesSummary> {
  const summary: PersistPunditQuotesSummary = {
    proposed: 0,
    verified: 0,
    written: 0,
    rejected: [],
    skippedExcluded: 0,
  };

  const sources = opts.sources ?? [];
  const withQuotes = records.filter((r) => validIds.has(r.fightId) && r.punditQuotes?.length);
  if (withQuotes.length === 0) return summary;

  if (sources.length === 0) {
    // Can't verify without the fetched text, and an unverified quote never ships.
    summary.proposed = withQuotes.reduce((n, r) => n + r.punditQuotes.length, 0);
    console.warn(
      `[aiEnrichment.postFight] ${summary.proposed} pundit quote(s) dropped — no source text supplied for verification`,
    );
    return summary;
  }

  const punditCache = new Map<string, { id: string; excluded: boolean }>();

  for (const rec of withQuotes) {
    summary.proposed += rec.punditQuotes.length;

    const { verified, rejected } = verifyPunditQuotes(rec.punditQuotes, sources);
    summary.verified += verified.length;
    summary.rejected.push(...rejected);

    for (const q of verified) {
      if (opts.dryRun) {
        summary.written++;
        continue;
      }

      const pundit = await resolvePundit(prisma, q.speaker, q.speakerRole, punditCache);
      if (!pundit) continue;
      if (pundit.excluded) {
        summary.skippedExcluded++;
        continue;
      }

      try {
        await prisma.punditQuote.upsert({
          where: {
            fightId_punditId_quoteHash: {
              fightId: rec.fightId,
              punditId: pundit.id,
              quoteHash: q.quoteHash,
            },
          },
          create: {
            fightId: rec.fightId,
            punditId: pundit.id,
            quote: q.quote,
            outlet: q.outlet,
            sourceUrl: q.sourceUrl,
            aiConfidence: q.confidence,
            verified: true,
            quoteHash: q.quoteHash,
          },
          // Re-runs must never resurrect a quote an operator hid or took down,
          // so the update side deliberately touches nothing.
          update: {},
        });
        summary.written++;
      } catch (err: any) {
        console.warn(`[aiEnrichment.postFight] pundit quote write failed (${q.speaker}):`, err?.message);
      }
    }
  }

  if (summary.rejected.length) {
    console.warn(
      `[aiEnrichment.postFight] ${summary.rejected.length} pundit quote(s) failed verbatim verification:`,
      summary.rejected.map((r) => `${r.speaker}: ${r.reason}`).join('; '),
    );
  }

  return summary;
}
