/**
 * Fan DNA — type contract.
 *
 * Load-bearing decision: every trait satisfies the `Trait` interface and lives
 * as a single file under `traits/{id}/trait.ts`. The registry auto-discovers
 * them. Adding the 100th trait is mechanically identical to adding the 5th.
 *
 * Two query modes are first-class (handoff 2026-05-16):
 *   • batchCompute  — recompute trait value for a user (nightly cron)
 *   • eventEvaluate — react to a single user action with one DNA line (reveal
 *                     modals after rate/hype, future surfaces)
 *
 * The engine wraps `eventEvaluate` with toggle-storm detection, 30-day per-line
 * cooldown, anti-back-to-back pacing, and impression recording.
 */
import type { PrismaClient } from '@prisma/client';

/** Actions the engine can react to. */
export type FanDNAAction =
  | 'hype'
  | 'rate'
  | 'follow'
  | 'unfollow'
  | 'comment'
  | 'unlock';

/** Where the line is rendered. Used for filtering + impression telemetry. */
export type FanDNASurface =
  | 'hype-reveal-modal'
  | 'rate-reveal-modal'
  | 'profile-card'
  | 'profile-fullscreen'
  | 'weekly-recap';

/** Trait taxonomy from the handoff. */
export type FanDNAFamily = 'affinity' | 'behaviour' | 'prediction' | 'identity';

/** Tier = data dependency / shipping order. */
export type FanDNATier = 1 | 2 | 3 | 4;

/** Soft vs humor copy. Engine picks; trait can override. */
export type CopyVariant = 'soft' | 'humor';

/** What a trait emits from `batchCompute`. */
export interface TraitComputeResult {
  /** Trait-specific JSON payload. Shape is the trait's responsibility. */
  value: Record<string, unknown>;
  /** 0-1 confidence. Engine may withhold low-confidence traits from surfacing. */
  confidence: number;
  /** True iff trait has enough data to be meaningful for this user. */
  hasFloor: boolean;
}

/** Context passed to `eventEvaluate`. */
export interface EventContext {
  prisma: PrismaClient;
  userId: string;
  action: FanDNAAction;
  surface: FanDNASurface;
  /** The fight the action relates to, if any. */
  fightId?: string;
  /** Hype score, rating, etc. — value the user just submitted. */
  value?: number;
  /**
   * Latest `TraitValue` row for this (user, trait), if previously computed.
   * The engine pre-fetches this so the trait doesn't have to.
   */
  currentValue?: TraitComputeResult | null;
}

/** What a trait emits from `eventEvaluate`. */
export interface TraitEventResult {
  /** Used by the engine to pick the top trait when multiple respond. */
  score: number;
  /** Lookup key into `copy.lines` — must match a key in the trait's copy.json. */
  copyKey: string;
  /** Template variables interpolated into the rendered line. */
  vars?: Record<string, string | number>;
  /** Force a specific copy variant. If absent, engine picks (~40% humor). */
  variant?: CopyVariant;
}

/** Copy pool for one trait. Lives in `copy.json` next to `trait.ts`. */
export interface CopyVariants {
  /**
   * Keyed by `copyKey`. Each key has its own soft + humor pools. The engine
   * picks one line from the chosen pool, filters out cooldown lines, samples.
   */
  lines: Record<
    string,
    {
      soft?: string[];
      humor?: string[];
    }
  >;
}

/**
 * The trait contract. One file per trait under `traits/{id}/trait.ts`.
 *
 * Trait independence is mandatory — if one trait throws, the engine logs it
 * and moves on. Never let a single trait break the engine.
 */
export interface Trait {
  /** Stable identifier. Must match the directory name. */
  id: string;
  family: FanDNAFamily;
  tier: FanDNATier;
  /**
   * Bumped to trigger recompute backfill for all eligible users. Stored on
   * `TraitValue.version` so the engine knows which rows are stale.
   */
  version: number;

  /**
   * Recompute the value from scratch for one user. Persists to `TraitValue`
   * via the engine wrapper, not directly.
   * Return null if the user has no signal at all (e.g. zero ratings yet).
   */
  batchCompute(ctx: {
    prisma: PrismaClient;
    userId: string;
  }): Promise<TraitComputeResult | null>;

  /** Actions this trait will react to. The engine only calls it for these. */
  respondsTo: readonly FanDNAAction[];

  /** Surfaces this trait is allowed to render on. */
  surfaces: readonly FanDNASurface[];

  /**
   * Reaction to a single user action. Return null when the trait has nothing
   * to say about this particular event.
   */
  eventEvaluate(ctx: EventContext): Promise<TraitEventResult | null>;

  /** Copy pools — loaded from `copy.json` alongside this file. */
  copy: CopyVariants;

  /** Marks a trait as sunset: no new computation, no surfacing, history preserved. */
  deprecated?: boolean;
}

/** Final engine output — one rendered line + provenance for impression record. */
export interface DNALine {
  text: string;
  traitId: string;
  copyKey: string;
  /** Stable identifier for THIS exact line — drives 30-day cooldown. */
  lineKey: string;
  variant: CopyVariant;
  /** True when this was a toggle-storm META or EXIT line. */
  isMeta?: boolean;
}

/** Engine output for `eventEvaluate`. Null = no line worth surfacing. */
export type EventEvaluateResult = DNALine | null;

/** Toggle-storm thresholds (handoff 2026-05-16). */
export const TOGGLE_STORM = {
  /** Window in which to count same (user, fight, action) value changes. */
  WINDOW_MS: 10 * 60 * 1000,
  /** META threshold — return a wry meta line, bypass normal trait scoring. */
  META_THRESHOLD: 5,
  /** EXIT threshold — return exit line + mute this (user, fight) for QUIET_MS. */
  EXIT_THRESHOLD: 10,
  /** How long to stay quiet after an exit line. */
  QUIET_MS: 60 * 60 * 1000,
} as const;

/** Cooldown window for re-firing the exact same line to the same user. */
export const LINE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/** Probability of picking the humor variant when both pools have lines. */
export const HUMOR_RATIO = 0.4;
