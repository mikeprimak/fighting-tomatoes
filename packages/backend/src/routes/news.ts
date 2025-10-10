import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MMANewsScraper } from '../services/mmaNewsScraper';

export default async function newsRoutes(fastify: FastifyInstance) {
  // Get news articles
  fastify.get('/news', {
    schema: {
      description: 'Get MMA news articles',
      tags: ['news'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          page: { type: 'integer', minimum: 1, default: 1 },
          source: { type: 'string' }, // Filter by source: "MMA Fighting", "Bloody Elbow", etc.
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            articles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  headline: { type: 'string' },
                  description: { type: 'string' },
                  url: { type: 'string' },
                  source: { type: 'string' },
                  imageUrl: { type: ['string', 'null'] },
                  localImagePath: { type: ['string', 'null'] },
                  scrapedAt: { type: 'string' },
                  createdAt: { type: 'string' },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' },
              },
            },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit = 20, page = 1, source } = request.query as any;
    const skip = (page - 1) * limit;

    try {
      const where = source ? { source, isActive: true } : { isActive: true };

      const [articles, total] = await Promise.all([
        fastify.prisma.newsArticle.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        fastify.prisma.newsArticle.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit);

      return reply.code(200).send({
        articles,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      });
    } catch (error: any) {
      request.log.error('News articles fetch error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Get single news article
  fastify.get('/news/:id', {
    schema: {
      description: 'Get single news article',
      tags: ['news'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            article: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                headline: { type: 'string' },
                description: { type: 'string' },
                url: { type: 'string' },
                source: { type: 'string' },
                imageUrl: { type: ['string', 'null'] },
                localImagePath: { type: ['string', 'null'] },
                scrapedAt: { type: 'string' },
                createdAt: { type: 'string' },
              },
            },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      const article = await fastify.prisma.newsArticle.findUnique({
        where: { id },
      });

      if (!article) {
        return reply.code(404).send({
          error: 'Article not found',
          code: 'ARTICLE_NOT_FOUND',
        });
      }

      return reply.code(200).send({ article });
    } catch (error: any) {
      request.log.error('News article fetch error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Trigger news scraping (manual)
  fastify.post('/news/scrape', {
    schema: {
      description: 'Manually trigger news scraping',
      tags: ['news'],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            articlesScraped: { type: 'integer' },
            newArticles: { type: 'integer' },
            sources: {
              type: 'object',
              properties: {
                'MMA Fighting': { type: 'integer' },
                'Bloody Elbow': { type: 'integer' },
                'UFC': { type: 'integer' },
                'Bleacher Report': { type: 'integer' },
              },
            },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const scraper = new MMANewsScraper();
      const articles = await scraper.scrapeAll();

      // Save articles to database (upsert to avoid duplicates)
      let newArticlesCount = 0;
      const sourceCounts: Record<string, number> = {
        'MMA Fighting': 0,
        'Bloody Elbow': 0,
        'UFC': 0,
        'Bleacher Report': 0,
        'Sherdog': 0,
        'ESPN Boxing': 0,
      };

      // Filter out existing articles first
      const existingUrls = await fastify.prisma.newsArticle.findMany({
        where: { url: { in: articles.map(a => a.url) } },
        select: { url: true },
      });
      const existingUrlSet = new Set(existingUrls.map(a => a.url));
      const newArticles = articles.filter(a => !existingUrlSet.has(a.url));

      // Create all new articles in bulk (preserves randomized order)
      if (newArticles.length > 0) {
        // Use the same base timestamp for all articles in this scrape session
        const baseTime = new Date();

        await fastify.prisma.newsArticle.createMany({
          data: newArticles.map((article, index) => ({
            headline: article.headline,
            description: article.description || '',
            url: article.url,
            source: article.source,
            imageUrl: article.imageUrl,
            localImagePath: article.localImagePath,
            scrapedAt: article.scrapedAt,
            // Add milliseconds to preserve order while keeping them close together
            createdAt: new Date(baseTime.getTime() + index),
          })),
        });

        newArticlesCount = newArticles.length;
        newArticles.forEach(article => {
          sourceCounts[article.source] = (sourceCounts[article.source] || 0) + 1;
        });
      }

      return reply.code(200).send({
        message: 'News scraping completed',
        articlesScraped: articles.length,
        newArticles: newArticlesCount,
        sources: sourceCounts,
      });
    } catch (error: any) {
      request.log.error('News scraping error:', error);
      return reply.code(500).send({
        error: 'Scraping failed',
        code: 'SCRAPING_ERROR',
      });
    }
  });

  // Get news sources
  fastify.get('/news/sources', {
    schema: {
      description: 'Get available news sources with article counts',
      tags: ['news'],
      response: {
        200: {
          type: 'object',
          properties: {
            sources: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  count: { type: 'integer' },
                  latestArticle: { type: ['string', 'null'] },
                },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sources = await fastify.prisma.newsArticle.groupBy({
        by: ['source'],
        where: { isActive: true },
        _count: {
          source: true,
        },
      });

      const sourcesWithLatest = await Promise.all(
        sources.map(async (s) => {
          const latest = await fastify.prisma.newsArticle.findFirst({
            where: { source: s.source, isActive: true },
            orderBy: { scrapedAt: 'desc' },
            select: { scrapedAt: true },
          });

          return {
            name: s.source,
            count: s._count.source,
            latestArticle: latest?.scrapedAt.toISOString() || null,
          };
        })
      );

      return reply.code(200).send({ sources: sourcesWithLatest });
    } catch (error: any) {
      request.log.error('News sources fetch error:', error);
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });
}
