/**
 * Fan DNA engine — the runtime around the trait registry.
 *
 * Public surface:
 *   • eventEvaluate(ctx)  — react to one user action with one rendered line.
 *                           Handles toggle-storm contingency, 30-day per-line
 *                           cooldown, anti-back-to-back, impression recording.
 *   • batchCompute(args)  — recompute one or all traits for one user, persist
 *                           to `fan_dna_trait_values`.
 *
 * Non-blocking from callers: `eventEvaluate` swallows errors per-trait so one
 * bad trait can't break the reveal modal. Worst case it returns null and the
 * UI renders the existing 2-beat reveal.
 */
import { createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';

import {
  HUMOR_RATIO,
  LINE_COOLDOWN_MS,
  TOGGLE_STORM,
  type CopyVariant,
  type DNALine,
  type EventContext,
  type EventEvaluateResult,
  type FanDNAAction,
  type FanDNASurface,
  type Trait,
  type TraitComputeResult,
  type TraitEventResult,
} from './types';
import {
  getAllTraits,
  getTrait,
  getTraitsRespondingTo,
} from './registry';
import { pickExitLine, pickMetaLine } from './toggleStormCopy';

// ─────────────────────────── eventEvaluate ───────────────────────────

export interface EventEvaluateArgs {
  prisma: PrismaClient;
  userId: string;
  action: FanDNAAction;
  surface: FanDNASurface;
  fightId?: string;
  value?: number;
}

export async function eventEvaluate(
  args: EventEvaluateArgs,
): Promise<EventEvaluateResult> {
  const { prisma, userId, action, surface, fightId, value } = args;

  // 1. If we already fired an EXIT line for this (user, fight) within the
  //    quiet window, stay silent. The user has seen our best material.
  if (fightId) {
    const since = new Date(Date.now() - TOGGLE_STORM.QUIET_MS);
    const exit = await prisma.dNALineImpression.findFirst({
      where: {
        userId,
        fightId,
        variant: 'exit',
        firedAt: { gt: since },
      },
      orderBy: { firedAt: 'desc' },
    });
    if (exit) {
      await recordImpression(prisma, {
        userId,
        surface,
        action,
        fightId,
        value,
        lineKey: '__quiet__',
        variant: 'none',
      });
      return null;
    }
  }

  // 2. Count prior (user, fight, action) actions in the storm window.
  let priorCount = 0;
  if (fightId) {
    const windowStart = new Date(Date.now() - TOGGLE_STORM.WINDOW_MS);
    priorCount = await prisma.dNALineImpression.count({
      where: {
        userId,
        fightId,
        action,
        firedAt: { gt: windowStart },
      },
    });
  }
  const totalActions = priorCount + 1; // this call counts too

  // 3. Toggle-storm tiers. EXIT before META — the higher threshold wins.
  if (totalActions >= TOGGLE_STORM.EXIT_THRESHOLD) {
    const seed = `${userId}|${fightId ?? ''}|${action}|exit`;
    const text = pickExitLine(seed);
    const lineKey = `__exit__:${hash(text)}`;
    await recordImpression(prisma, {
      userId,
      surface,
      action,
      fightId,
      value,
      lineKey,
      variant: 'exit',
    });
    return {
      text,
      traitId: '__engine__',
      copyKey: '__exit__',
      lineKey,
      variant: 'soft',
      isMeta: true,
    };
  }

  if (totalActions >= TOGGLE_STORM.META_THRESHOLD) {
    const seed = `${userId}|${fightId ?? ''}|${action}|${totalActions}`;
    const text = pickMetaLine(seed);
    const lineKey = `__meta__:${hash(text)}`;
    await recordImpression(prisma, {
      userId,
      surface,
      action,
      fightId,
      value,
      lineKey,
      variant: 'meta',
    });
    return {
      text,
      traitId: '__engine__',
      copyKey: '__meta__',
      lineKey,
      variant: 'soft',
      isMeta: true,
    };
  }

  // 4. Normal path — run every trait that responds to this action + surface.
  const candidates = getTraitsRespondingTo(action).filter((t) =>
    t.surfaces.includes(surface),
  );

  const results: Array<{ trait: Trait; result: TraitEventResult }> = [];
  for (const trait of candidates) {
    try {
      const currentValue = await fetchTraitValue(prisma, userId, trait.id);
      const result = await trait.eventEvaluate({
        prisma,
        userId,
        action,
        surface,
        fightId,
        value,
        currentValue,
      } as EventContext);
      if (result) results.push({ trait, result });
    } catch (err) {
      console.error(`[fanDNA] Trait ${trait.id} threw in eventEvaluate:`, err);
      // Trait isolation — one trait's failure must not break others.
    }
  }

  if (results.length === 0) {
    await recordImpression(prisma, {
      userId,
      surface,
      action,
      fightId,
      value,
      lineKey: '__none__',
      variant: 'none',
    });
    return null;
  }

  // 5. Rank by score, descending. Tie-break by trait id for determinism.
  results.sort((a, b) => {
    if (b.result.score !== a.result.score) return b.result.score - a.result.score;
    return a.trait.id.localeCompare(b.trait.id);
  });

  // 6. Walk candidates in order — first one whose copy pool has a fresh line wins.
  for (const { trait, result } of results) {
    const line = await pickLine(prisma, userId, trait, result);
    if (line) {
      await recordImpression(prisma, {
        userId,
        surface,
        action,
        fightId,
        value,
        lineKey: line.lineKey,
        variant: line.variant,
        traitId: trait.id,
        copyKey: result.copyKey,
      });
      return line;
    }
  }

  // Everyone's copy was on cooldown. Stay silent rather than re-fire.
  await recordImpression(prisma, {
    userId,
    surface,
    action,
    fightId,
    value,
    lineKey: '__cooldown_all__',
    variant: 'none',
  });
  return null;
}

// ─────────────────────────── batchCompute ───────────────────────────

export interface BatchComputeArgs {
  prisma: PrismaClient;
  userId: string;
  /** Restrict to one trait. Omit to recompute every non-deprecated trait. */
  traitId?: string;
}

export interface BatchComputeResult {
  computed: Array<{ traitId: string; confidence: number; hasFloor: boolean }>;
  errors: Array<{ traitId: string; message: string }>;
}

export async function batchCompute(
  args: BatchComputeArgs,
): Promise<BatchComputeResult> {
  const { prisma, userId, traitId } = args;
  const traits = traitId
    ? [getTrait(traitId)].filter((t): t is Trait => !!t && !t.deprecated)
    : getAllTraits().filter((t) => !t.deprecated);

  const computed: BatchComputeResult['computed'] = [];
  const errors: BatchComputeResult['errors'] = [];

  for (const trait of traits) {
    try {
      const value = await trait.batchCompute({ prisma, userId });
      if (!value) continue;
      await prisma.traitValue.upsert({
        where: { userId_traitId: { userId, traitId: trait.id } },
        create: {
          userId,
          traitId: trait.id,
          version: trait.version,
          value: value.value as object,
          confidence: value.confidence,
          hasFloor: value.hasFloor,
        },
        update: {
          version: trait.version,
          value: value.value as object,
          confidence: value.confidence,
          hasFloor: value.hasFloor,
          computedAt: new Date(),
        },
      });
      computed.push({
        traitId: trait.id,
        confidence: value.confidence,
        hasFloor: value.hasFloor,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[fanDNA] batchCompute ${trait.id} failed:`, err);
      errors.push({ traitId: trait.id, message });
    }
  }

  return { computed, errors };
}

// ─────────────────────────── helpers ───────────────────────────

async function fetchTraitValue(
  prisma: PrismaClient,
  userId: string,
  traitId: string,
): Promise<TraitComputeResult | null> {
  const row = await prisma.traitValue.findUnique({
    where: { userId_traitId: { userId, traitId } },
  });
  if (!row) return null;
  return {
    value: row.value as Record<string, unknown>,
    confidence: row.confidence,
    hasFloor: row.hasFloor,
  };
}

interface RecordImpressionArgs {
  userId: string;
  surface: FanDNASurface;
  action: FanDNAAction;
  fightId?: string;
  value?: number;
  lineKey: string;
  variant: 'soft' | 'humor' | 'meta' | 'exit' | 'none';
  traitId?: string;
  copyKey?: string;
}

async function recordImpression(
  prisma: PrismaClient,
  args: RecordImpressionArgs,
): Promise<void> {
  try {
    await prisma.dNALineImpression.create({
      data: {
        userId: args.userId,
        traitId: args.traitId ?? null,
        copyKey: args.copyKey ?? null,
        lineKey: args.lineKey,
        surface: args.surface,
        action: args.action,
        fightId: args.fightId ?? null,
        value: args.value ?? null,
        variant: args.variant,
      },
    });
  } catch (err) {
    // Telemetry write must never break the user flow.
    console.error('[fanDNA] Failed to record impression:', err);
  }
}

async function pickLine(
  prisma: PrismaClient,
  userId: string,
  trait: Trait,
  result: TraitEventResult,
): Promise<DNALine | null> {
  const pool = trait.copy.lines[result.copyKey];
  if (!pool) {
    console.warn(
      `[fanDNA] Trait ${trait.id} returned copyKey="${result.copyKey}" but no such pool exists in copy.json`,
    );
    return null;
  }

  // Determine variant order: trait can force, otherwise weighted toss.
  const variants: CopyVariant[] = result.variant
    ? [result.variant]
    : Math.random() < HUMOR_RATIO
      ? ['humor', 'soft']
      : ['soft', 'humor'];

  // Pre-fetch every lineKey that's on cooldown for this user in this pool.
  const allTemplates: Array<{ variant: CopyVariant; template: string; lineKey: string }> = [];
  for (const v of ['soft', 'humor'] as const) {
    const lines = pool[v] ?? [];
    for (const template of lines) {
      allTemplates.push({
        variant: v,
        template,
        lineKey: lineKeyFor(trait.id, result.copyKey, v, template),
      });
    }
  }
  if (allTemplates.length === 0) return null;

  const since = new Date(Date.now() - LINE_COOLDOWN_MS);
  const onCooldownRows = await prisma.dNALineImpression.findMany({
    where: {
      userId,
      lineKey: { in: allTemplates.map((t) => t.lineKey) },
      firedAt: { gt: since },
    },
    select: { lineKey: true },
  });
  const onCooldown = new Set(onCooldownRows.map((r) => r.lineKey));

  for (const v of variants) {
    const fresh = allTemplates.filter(
      (t) => t.variant === v && !onCooldown.has(t.lineKey),
    );
    if (fresh.length === 0) continue;
    const pick = fresh[Math.floor(Math.random() * fresh.length)];
    const text = interpolate(pick.template, result.vars ?? {});
    return {
      text,
      traitId: trait.id,
      copyKey: result.copyKey,
      lineKey: pick.lineKey,
      variant: pick.variant,
    };
  }
  return null;
}

function lineKeyFor(
  traitId: string,
  copyKey: string,
  variant: CopyVariant,
  template: string,
): string {
  const h = hash(`${traitId}|${copyKey}|${variant}|${template}`).slice(0, 12);
  return `${traitId}.${copyKey}.${h}`;
}

function hash(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const v = vars[name];
    return v === undefined ? `{${name}}` : String(v);
  });
}
