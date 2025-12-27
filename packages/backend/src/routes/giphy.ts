// Giphy proxy route - keeps API key secure on backend
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticateUser } from '../middleware/auth';

interface SearchQuery {
  q?: string;
  limit?: number;
  offset?: number;
  rating?: string;
}

export default async function giphyRoutes(fastify: FastifyInstance) {
  const GIPHY_API_KEY = process.env.GIPHY_API_KEY;

  // Search GIFs endpoint
  fastify.get('/search', {
    preHandler: authenticateUser,
    schema: {
      description: 'Search for GIFs via Giphy API',
      tags: ['giphy'],
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search query' },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 30 },
          offset: { type: 'integer', minimum: 0, default: 0 },
          rating: { type: 'string', enum: ['g', 'pg', 'pg-13', 'r'], default: 'pg-13' },
        },
        required: ['q'],
      },
    },
  }, async (request: FastifyRequest<{ Querystring: SearchQuery }>, reply: FastifyReply) => {
    if (!GIPHY_API_KEY) {
      console.error('[Giphy] GIPHY_API_KEY not configured');
      return reply.code(500).send({
        error: 'Giphy service not configured',
        code: 'SERVICE_UNAVAILABLE',
      });
    }

    const { q, limit = 30, offset = 0, rating = 'pg-13' } = request.query;

    try {
      const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q || '')}&limit=${limit}&offset=${offset}&rating=${rating}`;

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        console.error('[Giphy] API error:', data);
        return reply.code(response.status).send({
          error: 'Giphy API error',
          code: 'GIPHY_ERROR',
        });
      }

      return reply.send(data);
    } catch (error: any) {
      console.error('[Giphy] Search error:', error.message);
      return reply.code(500).send({
        error: 'Failed to fetch GIFs',
        code: 'FETCH_ERROR',
      });
    }
  });

  // Trending GIFs endpoint (with combat sports default)
  fastify.get('/trending', {
    preHandler: authenticateUser,
    schema: {
      description: 'Get trending/combat sports GIFs',
      tags: ['giphy'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 30 },
          offset: { type: 'integer', minimum: 0, default: 0 },
          rating: { type: 'string', enum: ['g', 'pg', 'pg-13', 'r'], default: 'pg-13' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Querystring: SearchQuery }>, reply: FastifyReply) => {
    if (!GIPHY_API_KEY) {
      console.error('[Giphy] GIPHY_API_KEY not configured');
      return reply.code(500).send({
        error: 'Giphy service not configured',
        code: 'SERVICE_UNAVAILABLE',
      });
    }

    const { limit = 30, offset = 0, rating = 'pg-13' } = request.query;

    try {
      // Use combat sports search instead of generic trending
      const searchQuery = 'mma+ufc+knockout+punch+ring+girl+fight+fighter';
      const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${searchQuery}&limit=${limit}&offset=${offset}&rating=${rating}`;

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        console.error('[Giphy] API error:', data);
        return reply.code(response.status).send({
          error: 'Giphy API error',
          code: 'GIPHY_ERROR',
        });
      }

      return reply.send(data);
    } catch (error: any) {
      console.error('[Giphy] Trending error:', error.message);
      return reply.code(500).send({
        error: 'Failed to fetch GIFs',
        code: 'FETCH_ERROR',
      });
    }
  });
}
