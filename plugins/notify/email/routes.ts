import type {FastifyInstance} from 'fastify'
import {publishRealtime} from '../../../api/src/realtime.js'
import {registerNotifierTargetRoutes} from '../shared/targetRoutes.js'
import {
  buildTargetConfigView,
  isConfigured,
  normalizeConfig,
  normalizeTargetOverride,
  readDefaults,
  resolveEmailConfigForTarget,
  writeDefaults,
} from './config.js'
import {sendAlert, testEvent} from './send.js'

const errorResponse = {
  type: 'object',
  properties: {error: {type: 'string'}},
} as const

const configSchema = {
  type: 'object',
  required: ['mode', 'from', 'to', 'sendmailPath', 'smtp'],
  properties: {
    mode: {type: 'string', enum: ['sendmail', 'smtp']},
    from: {type: 'string'},
    to: {type: 'array', items: {type: 'string'}},
    sendmailPath: {type: 'string'},
    smtp: {
      type: 'object',
      required: ['host', 'port', 'secure', 'username', 'password'],
      properties: {
        host: {type: 'string'},
        port: {type: 'integer'},
        secure: {type: 'boolean'},
        username: {type: 'string'},
        password: {type: 'string'},
      },
    },
  },
} as const

export async function registerEmailRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/config',
    {
      schema: {
        tags: ['email'],
        summary: 'Get default Email notifier parameters for all targets',
        response: {200: configSchema},
      },
    },
    async () => readDefaults(),
  )

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
        summary: 'Set default Email notifier parameters for all targets',
        body: configSchema,
        response: {200: configSchema, 400: errorResponse},
      },
    },
    async (req, reply) => {
      try {
        const config = writeDefaults(normalizeConfig(req.body))
        publishRealtime('plugin-manager.updated', {reason: 'email-defaults'})
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
        tags: ['email'],
        summary: 'Send an Email test message using saved defaults',
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
        return reply.code(400).send({error: 'set email from and to first'})
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
    notifierId: 'email',
    openapiTag: 'email',
    configSchema,
    readDefaults,
    writeDefaults: input => writeDefaults(normalizeConfig(input)),
    buildTargetConfigView,
    normalizeTargetOverride,
    resolveForTarget: resolveEmailConfigForTarget,
    isConfigured,
    testSend: config => sendAlert(config, testEvent()),
    publishDefaultsReason: 'email-defaults',
  })
}
