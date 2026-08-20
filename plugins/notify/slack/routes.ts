import type {FastifyInstance} from 'fastify'
import {publishRealtime} from '../../../api/src/realtime.js'
import {registerNotifierTargetRoutes} from '../shared/targetRoutes.js'
import {
  buildTargetConfigView,
  isConfigured,
  normalizeConfig,
  normalizeTargetOverride,
  readDefaults,
  resolveSlackConfigForTarget,
  writeDefaults,
} from './config.js'
import {sendAlert, testEvent} from './send.js'

const errorResponse = {
  type: 'object',
  properties: {error: {type: 'string'}},
} as const

const configSchema = {
  type: 'object',
  required: ['webhookUrl', 'username'],
  properties: {
    webhookUrl: {type: 'string'},
    username: {type: 'string'},
  },
} as const

export async function registerSlackRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/config',
    {
      schema: {
        tags: ['slack'],
        summary: 'Get default Slack notifier parameters for all targets',
        response: {200: configSchema},
      },
    },
    async () => readDefaults(),
  )

  app.put<{Body: {webhookUrl?: string; username?: string}}>(
    '/config',
    {
      schema: {
        tags: ['slack'],
        summary: 'Set default Slack notifier parameters for all targets',
        body: configSchema,
        response: {200: configSchema, 400: errorResponse},
      },
    },
    async (req, reply) => {
      try {
        const config = writeDefaults(normalizeConfig(req.body))
        publishRealtime('plugin-manager.updated', {reason: 'slack-defaults'})
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
        tags: ['slack'],
        summary: 'Send a Slack test message using saved defaults',
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
        return reply.code(400).send({error: 'set slack webhookUrl first'})
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
    notifierId: 'slack',
    openapiTag: 'slack',
    configSchema,
    readDefaults,
    writeDefaults: input => writeDefaults(normalizeConfig(input)),
    buildTargetConfigView,
    normalizeTargetOverride,
    resolveForTarget: resolveSlackConfigForTarget,
    isConfigured,
    testSend: config => sendAlert(config, testEvent()),
    publishDefaultsReason: 'slack-defaults',
  })
}
