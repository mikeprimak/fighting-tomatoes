/**
 * Fan DNA routes.
 *
 * Surface for the engine in services/fanDNA/. The mobile reveal modals POST
 * to /api/fan-dna/event after a hype or rating is submitted, and either get
 * back a DNA line to render as a third beat, or null (silent).
 *
 * Failure mode is intentional: the route never throws into the user's flow.
 * Mobile handles null + 5xx identically — render the modal without the beat.
 */
import { FastifyInstance } from 'fastify';

import { authenticateUser } from '../middleware/auth';
import { batchCompute, eventEvaluate } from '../services/fanDNA/engine';
import { computeUserType } from '../services/fanDNA/personalityType';
import { getAllTraits } from '../services/fanDNA/registry';
import { computeTasteProfile } from '../services/fanDNA/tasteProfile';
import {
  loadTasteInputs,
  type LoadedTasteInputs,
} from '../services/fanDNA/tasteProfile/loadInputs';
import type {
  FanDNAAction,
  FanDNASurface,
} from '../services/fanDNA/types';

// How long a TraitValue stays fresh before /profile recomputes. Cron will
// eventually own recompute; until then this gives us a sensible auto-refresh.
const PROFILE_STALE_MS = 24 * 60 * 60 * 1000;

// loadTasteInputs reads the user's full rating history each call — fine
// per-view, not per-remount. Inputs (not responses) are cached so ?max/?salt
// can vary without a reload; the pure engine recomputes cheaply.
const TASTE_CACHE_TTL_MS = 10 * 60 * 1000;
const TASTE_CACHE_MAX = 500;
const tasteInputsCache = new Map<string, { at: number; inputs: LoadedTasteInputs }>();

const DEFAULT_TASTE_MAX = 8;

/** ISO-week salt (e.g. "2026-W24") — copy rotates weekly, stable within one. */
function isoWeekSalt(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const ACTIONS: FanDNAAction[] = [
  'hype',
  'rate',
  'follow',
  'unfollow',
  'comment',
  'unlock',
];
const SURFACES: FanDNASurface[] = [
  'hype-reveal-modal',
  'rate-reveal-modal',
  'profile-card',
  'profile-fullscreen',
  'weekly-recap',
];

export default async function fanDNARoutes(fastify: FastifyInstance) {
  fastify.post('/event', {
    schema: {
      description: 'Evaluate one user action through the Fan DNA engine. Returns one line or null.',
      tags: ['fan-dna'],
      body: {
        type: 'object',
        required: ['action', 'surface'],
        properties: {
          action: { type: 'string', enum: ACTIONS },
          surface: { type: 'string', enum: SURFACES },
          fightId: { type: 'string' },
          value: { type: 'number' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            line: { type: ['string', 'null'] },
            traitId: { type: ['string', 'null'] },
            copyKey: { type: ['string', 'null'] },
            lineKey: { type: ['string', 'null'] },
            variant: { type: ['string', 'null'] },
            isMeta: { type: 'boolean' },
          },
        },
      },
    },
    preHandler: authenticateUser,
  }, async (request, reply) => {
    const user = (request as any).user;
    const body = request.body as {
      action: FanDNAAction;
      surface: FanDNASurface;
      fightId?: string;
      value?: number;
    };

    try {
      const result = await eventEvaluate({
        prisma: fastify.prisma,
        userId: user.id,
        action: body.action,
        surface: body.surface,
        fightId: body.fightId,
        value: body.value,
      });

      if (!result) {
        return reply.code(200).send({
          line: null,
          traitId: null,
          copyKey: null,
          lineKey: null,
          variant: null,
          isMeta: false,
        });
      }

      return reply.code(200).send({
        line: result.text,
        traitId: result.traitId,
        copyKey: result.copyKey,
        lineKey: result.lineKey,
        variant: result.variant,
        isMeta: result.isMeta ?? false,
      });
    } catch (err: unknown) {
      request.log.error(err, '[fanDNA] /event handler failed');
      // Silent failure — mobile renders the modal without the beat.
      return reply.code(200).send({
        line: null,
        traitId: null,
        copyKey: null,
        lineKey: null,
        variant: null,
        isMeta: false,
      });
    }
  });

  fastify.get('/peek', {
    schema: {
      description:
        'Pre-compute the DNA line for every possible value (1-10) of an upcoming user action. Lets the reveal modal render instantly on Done without a network round trip. Does NOT record impressions — the commit path passes the chosen line back.',
      tags: ['fan-dna'],
      querystring: {
        type: 'object',
        required: ['action', 'surface'],
        properties: {
          action: { type: 'string', enum: ACTIONS },
          surface: { type: 'string', enum: SURFACES },
          fightId: { type: 'string' },
        },
      },
    },
    preHandler: authenticateUser,
  }, async (request, reply) => {
    const user = (request as any).user;
    const query = request.query as {
      action: FanDNAAction;
      surface: FanDNASurface;
      fightId?: string;
    };

    try {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const results = await Promise.all(
        values.map(async (value) => {
          try {
            return await eventEvaluate({
              prisma: fastify.prisma,
              userId: user.id,
              action: query.action,
              surface: query.surface,
              fightId: query.fightId,
              value,
              peek: true,
            });
          } catch (err) {
            request.log.warn(
              { err, value },
              '[fanDNA] peek eval failed for one value',
            );
            return null;
          }
        }),
      );

      const lines = results.map((r) =>
        r
          ? {
              line: r.text,
              traitId: r.traitId,
              copyKey: r.copyKey,
              lineKey: r.lineKey,
              variant: r.variant,
              isMeta: r.isMeta ?? false,
            }
          : null,
      );

      return reply.code(200).send({ lines });
    } catch (err) {
      request.log.error(err, '[fanDNA] /peek handler failed');
      return reply
        .code(200)
        .send({ lines: [null, null, null, null, null, null, null, null, null, null] });
    }
  });

  fastify.get('/profile', {
    schema: {
      description:
        'Surfaced Fan DNA traits for the current user. Lazy-recomputes any trait whose TraitValue is stale (>24h) or missing. Returns one card per trait whose profileSummary fires; sorted by weight desc.',
      tags: ['fan-dna'],
    },
    preHandler: authenticateUser,
  }, async (request, reply) => {
    const user = (request as any).user;
    const userId = user.id;

    try {
      const traits = getAllTraits().filter(
        (t) => !t.deprecated && typeof t.profileSummary === 'function',
      );

      const existing = await fastify.prisma.traitValue.findMany({
        where: { userId, traitId: { in: traits.map((t) => t.id) } },
        select: {
          traitId: true,
          value: true,
          confidence: true,
          hasFloor: true,
          version: true,
          computedAt: true,
        },
      });
      const existingMap = new Map(existing.map((r) => [r.traitId, r]));

      const staleSince = new Date(Date.now() - PROFILE_STALE_MS);
      const stale = traits.filter((t) => {
        const row = existingMap.get(t.id);
        if (!row) return true;
        if (row.version !== t.version) return true;
        if (row.computedAt < staleSince) return true;
        return false;
      });

      if (stale.length > 0) {
        for (const trait of stale) {
          await batchCompute({
            prisma: fastify.prisma,
            userId,
            traitId: trait.id,
          });
        }
        // Re-read after recompute so the response reflects the freshest values.
        const refreshed = await fastify.prisma.traitValue.findMany({
          where: { userId, traitId: { in: stale.map((t) => t.id) } },
        });
        for (const row of refreshed) existingMap.set(row.traitId, row);
      }

      const cards: Array<{
        traitId: string;
        family: string;
        headline: string;
        body?: string;
        primaryStat?: string;
        secondaryStat?: string;
        weight: number;
        confidence: number;
        computedAt: string;
      }> = [];

      for (const trait of traits) {
        const row = existingMap.get(trait.id);
        if (!row || !row.hasFloor) continue;
        const result = trait.profileSummary!(row.value as Record<string, unknown>);
        if (!result) continue;
        const summaries = Array.isArray(result) ? result : [result];
        for (const summary of summaries) {
          cards.push({
            traitId: trait.id,
            family: trait.family,
            headline: summary.headline,
            body: summary.body,
            primaryStat: summary.primaryStat,
            secondaryStat: summary.secondaryStat,
            weight: summary.weight,
            confidence: row.confidence,
            computedAt: row.computedAt.toISOString(),
          });
        }
      }

      cards.sort((a, b) => b.weight - a.weight);

      const personalityType = await computeUserType(fastify.prisma, userId);

      return reply.code(200).send({
        personalityType,
        cards,
        count: cards.length,
      });
    } catch (err: unknown) {
      request.log.error(err, '[fanDNA] /profile handler failed');
      return reply.code(500).send({
        error: 'Failed to load Fan DNA profile',
        code: 'FAN_DNA_PROFILE_FAILED',
      });
    }
  });

  fastify.get('/taste-profile', {
    schema: {
      description:
        'Ranked taste-profile insights for the current user (the new taste engine, services/fanDNA/tasteProfile). Serves the onboarding payoff screen and the home above-the-fold rail. Read-only: loads rating history, runs the pure engine. Empty insights = profile still forming (silence > filler).',
      tags: ['fan-dna'],
      querystring: {
        type: 'object',
        properties: {
          max: { type: 'integer', minimum: 1, maximum: 25 },
          salt: { type: 'string', maxLength: 32 },
          fresh: { type: 'boolean' },
        },
      },
    },
    preHandler: authenticateUser,
  }, async (request, reply) => {
    const user = (request as any).user;
    const query = request.query as { max?: number; salt?: string; fresh?: boolean };

    try {
      const now = Date.now();
      // fresh=true bypasses the input cache: the onboarding payoff screen
      // loads seconds after the user's ratings and follows land, so a cached
      // input set from earlier in the session would miss all of them.
      let cached = query.fresh ? undefined : tasteInputsCache.get(user.id);
      if (!cached || now - cached.at > TASTE_CACHE_TTL_MS) {
        const inputs = await loadTasteInputs(fastify.prisma, user.id);
        if (!tasteInputsCache.has(user.id) && tasteInputsCache.size >= TASTE_CACHE_MAX) {
          // Map iterates in insertion order — drop the oldest entry.
          const oldestKey = tasteInputsCache.keys().next().value;
          if (oldestKey !== undefined) tasteInputsCache.delete(oldestKey);
        }
        cached = { at: now, inputs };
        tasteInputsCache.set(user.id, cached);
      }

      const result = computeTasteProfile({
        userId: user.id,
        fights: cached.inputs.fights,
        fighters: cached.inputs.fighters,
        recCandidates: cached.inputs.recCandidates,
        rotationSalt: query.salt || isoWeekSalt(),
        maxInsights: query.max ?? DEFAULT_TASTE_MAX,
      });

      const b = result.signature.baseline;
      return reply.code(200).send({
        insights: result.insights.map((i) => ({
          key: i.key,
          kind: i.kind,
          dimension: i.dimension,
          token: i.token,
          headline: i.headline,
          subline: i.subline,
          score: i.score,
        })),
        baseline: { count: b.count, avg: b.avg, tensCount: b.tensCount },
        coverage: cached.inputs.characterCoverage,
      });
    } catch (err: unknown) {
      request.log.error(err, '[fanDNA] /taste-profile handler failed');
      return reply.code(500).send({
        error: 'Failed to compute taste profile',
        code: 'TASTE_PROFILE_FAILED',
      });
    }
  });

  fastify.get('/health', {
    schema: {
      description: 'Health snapshot of the Fan DNA registry.',
      tags: ['fan-dna'],
    },
  }, async (_request, reply) => {
    const traits = getAllTraits().map((t) => ({
      id: t.id,
      family: t.family,
      tier: t.tier,
      version: t.version,
      respondsTo: t.respondsTo,
      surfaces: t.surfaces,
      deprecated: t.deprecated ?? false,
      copyKeys: Object.keys(t.copy.lines),
    }));
    return reply.code(200).send({ traits, count: traits.length });
  });
}
