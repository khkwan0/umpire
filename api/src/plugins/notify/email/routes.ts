import type { FastifyInstance } from 'fastify'
import { isConfigured, normalizeConfig, readConfig, writeConfig } from './config.js'
import { sendAlert, testEvent } from './send.js'

const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const

const configSchema = {
  type: 'object',
  required: ['from', 'to'],
  properties: {
    from: { type: 'string' },
    to: { type: 'array', items: { type: 'string' } },
  },
} as const

export async function registerEmailRoutes(app: FastifyInstance): Promise<void> {
  app.get('/config', { schema: { tags: ['email'], summary: 'Get Email notifier config', response: { 200: configSchema } } }, async () => readConfig())

  app.put<{ Body: { from?: string; to?: string[] } }>(
    '/config',
    {
      schema: {
        tags: ['email'],
        summary: 'Set Email notifier config',
        body: configSchema,
        response: { 200: configSchema, 400: errorResponse },
      },
    },
    async (req, reply) => {
      try {
        return writeConfig(normalizeConfig(req.body))
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) })
      }
    },
  )

  app.post('/test', { schema: { tags: ['email'], summary: 'Send an Email test message', response: { 200: { type: 'object', required: ['ok', 'error'], properties: { ok: { type: 'boolean' }, error: { type: ['string', 'null'] } } }, 400: errorResponse } } }, async (req, reply) => {
    const config = readConfig()
    if (!isConfigured(config)) return reply.code(400).send({ error: 'set email from and to first' })
    try {
      await sendAlert(config, testEvent())
      return { ok: true, error: null }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
