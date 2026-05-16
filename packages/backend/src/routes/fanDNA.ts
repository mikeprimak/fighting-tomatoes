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
import { eventEvaluate } from '../services/fanDNA/engine';
import { getAllTraits } from '../services/fanDNA/registry';
import type {
  FanDNAAction,
  FanDNASurface,
} from '../services/fanDNA/types';

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
