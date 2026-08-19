import type { FastifyInstance } from 'fastify'
import { isConfigured, normalizeConfig, readConfig, writeConfig } from './config.js'
import { sendAlert, testEvent } from './send.js'

const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const

const configSchema = {
  type: 'object',
  required: ['webhookUrl', 'username'],
  properties: {
    webhookUrl: { type: 'string' },
    username: { type: 'string' },
  },
} as const

export async function registerDiscordRoutes(app: FastifyInstance): Promise<void> {
  app.get('/config', { schema: { tags: ['discord'], summary: 'Get Discord notifier config', response: { 200: configSchema } } }, async () => readConfig())

  app.put<{ Body: { webhookUrl?: string; username?: string } }>(
    '/config',
    {
      schema: {
        tags: ['discord'],
        summary: 'Set Discord notifier config',
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

  app.post('/test', { schema: { tags: ['discord'], summary: 'Send a Discord test message', response: { 200: { type: 'object', required: ['ok', 'error'], properties: { ok: { type: 'boolean' }, error: { type: ['string', 'null'] } } }, 400: errorResponse } } }, async (req, reply) => {
    const config = readConfig()
    if (!isConfigured(config)) return reply.code(400).send({ error: 'set discord webhookUrl first' })
    try {
      await sendAlert(config, testEvent())
      return { ok: true, error: null }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
