import type { FastifyInstance } from 'fastify'
import { isConfigured, normalizeConfig, readConfig, writeConfig } from './config.js'
import { sendAlert, testEvent } from './send.js'

const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const

const configSchema = {
  type: 'object',
  required: ['botToken', 'chatId', 'threadId'],
  properties: {
    botToken: { type: 'string' },
    chatId: { type: 'string' },
    threadId: { type: 'string' },
  },
} as const

export async function registerTelegramRoutes(app: FastifyInstance): Promise<void> {
  app.get('/config', { schema: { tags: ['telegram'], summary: 'Get Telegram notifier config', response: { 200: configSchema } } }, async () => readConfig())

  app.put<{ Body: { botToken?: string; chatId?: string; threadId?: string } }>(
    '/config',
    {
      schema: {
        tags: ['telegram'],
        summary: 'Set Telegram notifier config',
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

  app.post('/test', { schema: { tags: ['telegram'], summary: 'Send a Telegram test message', response: { 200: { type: 'object', required: ['ok', 'error'], properties: { ok: { type: 'boolean' }, error: { type: ['string', 'null'] } } }, 400: errorResponse } } }, async (req, reply) => {
    const config = readConfig()
    if (!isConfigured(config)) return reply.code(400).send({ error: 'set telegram botToken and chatId first' })
    try {
      await sendAlert(config, testEvent())
      return { ok: true, error: null }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
