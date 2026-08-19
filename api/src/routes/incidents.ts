import type { FastifyInstance } from 'fastify'
import { getCore } from '../core/index.js'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const

export async function incidentsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { limit?: number } }>(
    '/api/incidents',
    {
      schema: {
        tags: ['incidents'],
        summary: 'Outage and recovery log derived from check history',
        querystring: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: MAX_LIMIT,
              default: DEFAULT_LIMIT,
              description: 'Max incidents to return (newest activity first)',
            },
          },
        },
        response: {
          200: { type: 'array', items: { $ref: 'Incident#' } },
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const raw = req.query.limit
      const limit = raw == null ? DEFAULT_LIMIT : Number(raw)
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        return reply.code(400).send({ error: 'invalid limit' })
      }
      return getCore().listIncidents(limit)
    },
  )
}
