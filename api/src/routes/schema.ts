import type { FastifyInstance } from 'fastify'
import { getCore } from '../core/index.js'

export async function schemaRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { data?: string } }>(
    '/api/schema',
    {
      schema: {
        tags: ['schema'],
        summary: 'Frozen core SQLite schema (optional data snapshot)',
        querystring: {
          type: 'object',
          properties: {
            data: {
              type: 'string',
              description: 'Set to 1 to include a JSON dump of core tables',
            },
          },
        },
      },
    },
    async (req) => {
      const core = getCore()
      const includeData =
        req.query.data === '1' || req.query.data === 'true'
      return {
        engine: 'sqlite',
        tables: core.schema(),
        ...(includeData ? { data: core.dumpData() } : {}),
      }
    },
  )
}
