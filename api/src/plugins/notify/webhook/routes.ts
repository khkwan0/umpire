import type { FastifyInstance } from 'fastify'
import {
  isConfigured,
  normalizeConfig,
  readConfig,
  WEBHOOK_METHODS,
  writeConfig,
} from './config.js'
import { sendAlert, testEvent } from './send.js'

const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const

const methodSchema = {
  type: 'string',
  enum: [...WEBHOOK_METHODS],
  description:
    'HTTP method used to deliver AlertEvent. POST/PUT/PATCH/DELETE send JSON body; GET/HEAD/OPTIONS put the event on the query string. Default POST.',
} as const

const webhookConfigBodySchema = {
  type: 'object',
  required: ['url', 'headers'],
  properties: {
    url: {
      type: 'string',
      description: 'Request URL. Empty = not ready / skip notify.',
    },
    method: methodSchema,
    headers: {
      type: 'object',
      additionalProperties: { type: 'string' },
      description: 'Extra request headers (e.g. Authorization).',
    },
  },
} as const

const webhookConfigResponseSchema = {
  type: 'object',
  required: ['url', 'method', 'headers'],
  properties: {
    url: { type: 'string' },
    method: methodSchema,
    headers: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const

const webhookTestSchema = {
  type: 'object',
  required: ['ok', 'error'],
  properties: {
    ok: { type: 'boolean' },
    error: { type: ['string', 'null'] },
  },
} as const

export async function registerWebhookRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    '/config',
    {
      schema: {
        tags: ['webhook'],
        summary: 'Get webhook URL, method, and headers',
        description:
          'Owned by the webhook notifier. Mounted at /api/plugins/notify/webhook/config. Stored in webhook.json next to the core DB.',
        response: { 200: webhookConfigResponseSchema },
      },
    },
    async () => readConfig(),
  )

  app.put<{
    Body: { url?: string; method?: string; headers?: Record<string, string> }
  }>(
    '/config',
    {
      schema: {
        tags: ['webhook'],
        summary: 'Set webhook URL, HTTP method, and headers',
        body: webhookConfigBodySchema,
        response: {
          200: webhookConfigResponseSchema,
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return writeConfig(normalizeConfig(req.body))
      } catch (err) {
        return reply
          .code(400)
          .send({ error: err instanceof Error ? err.message : String(err) })
      }
    },
  )

  app.post(
    '/test',
    {
      schema: {
        tags: ['webhook'],
        summary: 'Send a sample AlertEvent using the saved URL and method',
        response: {
          200: webhookTestSchema,
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const config = readConfig()
      if (!isConfigured(config)) {
        return reply.code(400).send({ error: 'set a webhook URL first' })
      }
      try {
        await sendAlert(config, testEvent())
        return { ok: true, error: null }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  )
}
