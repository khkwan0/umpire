import type {FastifyInstance} from 'fastify'
import {publishRealtime} from '../../../api/src/realtime.js'
import {
  buildTargetConfigView,
  isConfigured,
  normalizeConfig,
  normalizeTargetOverride,
  readDefaults,
  resolveWebhookConfigForTarget,
  WEBHOOK_METHODS,
  writeDefaults,
} from './config.js'
import {registerNotifierTargetRoutes} from '../shared/targetRoutes.js'
import {sendAlert, testEvent} from './send.js'

const errorResponse = {
  type: 'object',
  properties: {error: {type: 'string'}},
} as const

const methodSchema = {
  type: 'string',
  enum: [...WEBHOOK_METHODS],
} as const

const configSchema = {
  type: 'object',
  required: ['url', 'method', 'headers'],
  properties: {
    url: {type: 'string'},
    method: methodSchema,
    headers: {
      type: 'object',
      additionalProperties: {type: 'string'},
    },
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
        summary: 'Get default webhook notifier parameters for all targets',
        response: {200: configSchema},
      },
    },
    async () => readDefaults(),
  )

  app.put<{
    Body: {url?: string; method?: string; headers?: Record<string, string>}
  }>(
    '/config',
    {
      schema: {
        tags: ['webhook'],
        summary: 'Set default webhook notifier parameters for all targets',
        body: configSchema,
        response: {
          200: configSchema,
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        const config = writeDefaults(normalizeConfig(req.body))
        publishRealtime('plugin-manager.updated', {
          reason: 'webhook-defaults',
        })
        return config
      } catch (err) {
        return reply
          .code(400)
          .send({error: err instanceof Error ? err.message : String(err)})
      }
    },
  )

  app.post(
    '/test',
    {
      schema: {
        tags: ['webhook'],
        summary: 'Send a sample AlertEvent using saved default config',
        response: {
          200: {
            type: 'object',
            required: ['ok', 'error'],
            properties: {
              ok: {type: 'boolean'},
              error: {type: ['string', 'null']},
            },
          },
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const config = readDefaults()
      if (!isConfigured(config)) {
        return reply.code(400).send({error: 'set a webhook URL first'})
      }
      try {
        await sendAlert(config, testEvent())
        return {ok: true, error: null}
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  )

  await registerNotifierTargetRoutes(app, {
    notifierId: 'webhook',
    openapiTag: 'webhook',
    configSchema,
    readDefaults,
    writeDefaults: input => writeDefaults(normalizeConfig(input)),
    buildTargetConfigView,
    normalizeTargetOverride,
    resolveForTarget: resolveWebhookConfigForTarget,
    isConfigured,
    testSend: config => sendAlert(config, testEvent()),
    publishDefaultsReason: 'webhook-defaults',
  })
}
