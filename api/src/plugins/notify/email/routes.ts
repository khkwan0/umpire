import type { FastifyInstance } from 'fastify'
import { isConfigured, normalizeConfig, readConfig, writeConfig } from './config.js'
import { sendAlert, testEvent } from './send.js'

const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const

const configSchema = {
  type: 'object',
  required: ['mode', 'from', 'to', 'sendmailPath', 'smtp'],
  properties: {
    mode: { type: 'string', enum: ['sendmail', 'smtp'] },
    from: { type: 'string' },
    to: { type: 'array', items: { type: 'string' } },
    sendmailPath: { type: 'string' },
    smtp: {
      type: 'object',
      required: ['host', 'port', 'secure', 'username', 'password'],
      properties: {
        host: { type: 'string' },
        port: { type: 'integer' },
        secure: { type: 'boolean' },
        username: { type: 'string' },
        password: { type: 'string' },
      },
    },
  },
} as const

export async function registerEmailRoutes(app: FastifyInstance): Promise<void> {
  app.get('/config', { schema: { tags: ['email'], summary: 'Get Email notifier config', response: { 200: configSchema } } }, async () => readConfig())

  app.put<{
    Body: {
      mode?: 'sendmail' | 'smtp'
      from?: string
      to?: string[]
      sendmailPath?: string
      smtp?: {
        host?: string
        port?: number
        secure?: boolean
        username?: string
        password?: string
      }
    }
  }>(
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
