import type { FastifyInstance } from 'fastify'
import {
  normalizeKeywordBodyConfig,
  readKeywordBodyConfig,
  writeKeywordBodyConfig,
} from './config.js'

const configSchema = {
  type: 'object',
  required: ['keyword', 'caseSensitive'],
  properties: {
    keyword: { type: 'string', minLength: 1 },
    caseSensitive: { type: 'boolean' },
  },
} as const

export async function registerKeywordBodyCheckRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    '/config',
    {
      schema: {
        tags: ['keyword-body-check'],
        summary: 'Get keyword/body check config',
        response: { 200: configSchema },
      },
    },
    async () => readKeywordBodyConfig(),
  )

  app.put<{ Body: { keyword?: string; caseSensitive?: boolean } }>(
    '/config',
    {
      schema: {
        tags: ['keyword-body-check'],
        summary: 'Set keyword/body check config',
        body: configSchema,
        response: {
          200: configSchema,
          400: {
            type: 'object',
            properties: { error: { type: 'string' } },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        return writeKeywordBodyConfig(normalizeKeywordBodyConfig(req.body))
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
  )
}
