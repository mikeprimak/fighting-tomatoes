// UFC Data Import Routes
import { FastifyInstance } from 'fastify';
import { importUFCData, getImportStats } from '../services/ufcDataParser';
import * as path from 'path';

export default async function importRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/import/ufc
   * Import UFC data from scraped JSON files into database
   */
  fastify.post('/ufc', async (request, reply) => {
    try {
      const { eventsFile, athletesFile, year } = request.body as {
        eventsFile?: string;
        athletesFile?: string;
        year?: number;
      };

      // Build file paths
      const scrapedDataDir = path.join(__dirname, '../../scraped-data');
      const options = {
        eventsFilePath: eventsFile
          ? path.join(scrapedDataDir, eventsFile)
          : path.join(scrapedDataDir, 'latest-events.json'),
        athletesFilePath: athletesFile
          ? path.join(scrapedDataDir, athletesFile)
          : path.join(scrapedDataDir, 'latest-athletes.json'),
        year: year || new Date().getFullYear()
      };

      await importUFCData(options);

      const stats = await getImportStats();

      return reply.status(200).send({
        data: {
          message: 'UFC data imported successfully',
          stats
        }
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Import failed',
        code: 'IMPORT_ERROR',
        details: error.message
      });
    }
  });

  /**
   * GET /api/import/stats
   * Get statistics about imported data
   */
  fastify.get('/stats', async (request, reply) => {
    try {
      const stats = await getImportStats();

      return reply.status(200).send({
        data: stats
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to get stats',
        code: 'STATS_ERROR',
        details: error.message
      });
    }
  });

  /**
   * POST /api/import/ufc/file
   * Import UFC data from custom file paths
   */
  fastify.post('/ufc/file', async (request, reply) => {
    try {
      const { eventsFilePath, athletesFilePath, year } = request.body as {
        eventsFilePath: string;
        athletesFilePath: string;
        year?: number;
      };

      if (!eventsFilePath || !athletesFilePath) {
        return reply.status(400).send({
          error: 'Missing required fields',
          code: 'VALIDATION_ERROR',
          details: 'eventsFilePath and athletesFilePath are required'
        });
      }

      await importUFCData({
        eventsFilePath,
        athletesFilePath,
        year: year || new Date().getFullYear()
      });

      const stats = await getImportStats();

      return reply.status(200).send({
        data: {
          message: 'UFC data imported successfully',
          stats
        }
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Import failed',
        code: 'IMPORT_ERROR',
        details: error.message
      });
    }
  });
}
