import type {FastifyInstance} from 'fastify'
import {publishRealtime} from '../../../realtime.js'
import {registerNotifierTargetRoutes} from '../shared/targetRoutes.js'
import {
  buildTargetConfigView,
  isConfigured,
  normalizeConfig,
  normalizeTargetOverride,
  readDefaults,
  resolveTelegramConfigForTarget,
  writeDefaults,
} from './config.js'
import {sendAlert, testEvent} from './send.js'

const errorResponse = {
  type: 'object',
  properties: {error: {type: 'string'}},
} as const

const configSchema = {
  type: 'object',
  required: ['botToken', 'chatId', 'threadId'],
  properties: {
    botToken: {type: 'string'},
    chatId: {type: 'string'},
    threadId: {type: 'string'},
  },
} as const

export async function registerTelegramRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    '/config',
    {
      schema: {
        tags: ['telegram'],
        summary: 'Get default Telegram notifier parameters for all targets',
        response: {200: configSchema},
      },
    },
    async () => readDefaults(),
  )

  app.put<{Body: {botToken?: string; chatId?: string; threadId?: string}}>(
    '/config',
    {
      schema: {
        tags: ['telegram'],
        summary: 'Set default Telegram notifier parameters for all targets',
        body: configSchema,
        response: {200: configSchema, 400: errorResponse},
      },
    },
    async (req, reply) => {
      try {
        const config = writeDefaults(normalizeConfig(req.body))
        publishRealtime('plugin-manager.updated', {
          reason: 'telegram-defaults',
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
        tags: ['telegram'],
        summary: 'Send a Telegram test message using saved defaults',
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
        return reply
          .code(400)
          .send({error: 'set telegram botToken and chatId first'})
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
    notifierId: 'telegram',
    openapiTag: 'telegram',
    configSchema,
    readDefaults,
    writeDefaults: input => writeDefaults(normalizeConfig(input)),
    buildTargetConfigView,
    normalizeTargetOverride,
    resolveForTarget: resolveTelegramConfigForTarget,
    isConfigured,
    testSend: config => sendAlert(config, testEvent()),
    publishDefaultsReason: 'telegram-defaults',
  })
}
