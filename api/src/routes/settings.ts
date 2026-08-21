import type {FastifyInstance} from 'fastify'
import {getCore} from '../core/index.js'
import type {AlertPolicy} from '../plugins/types.js'

const errorResponse = {
  type: 'object',
  properties: {error: {type: 'string'}},
} as const

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/settings',
    {
      schema: {
        tags: ['settings'],
        summary: 'Get alert and auth settings',
        response: {
          200: {$ref: 'Settings#'},
        },
      },
    },
    async () => getCore().getSettings(),
  )

  app.put<{
    Body: {
      alert_policy?: AlertPolicy
      throttle_minutes?: number
      auth_enabled?: boolean
      allow_readonly_without_auth?: boolean
    }
  }>(
    '/api/settings',
    {
      schema: {
        tags: ['settings'],
        summary: 'Update alert and auth settings',
        body: {
          type: 'object',
          properties: {
            alert_policy: {
              type: 'string',
              enum: ['state_change', 'every_fail', 'throttle'],
            },
            throttle_minutes: {type: 'integer', minimum: 1},
            auth_enabled: {type: 'boolean'},
            allow_readonly_without_auth: {type: 'boolean'},
          },
        },
        response: {
          200: {$ref: 'Settings#'},
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return getCore().updateSettings(req.body ?? {})
      } catch (err) {
        return reply
          .code(400)
          .send({error: err instanceof Error ? err.message : String(err)})
      }
    },
  )
}
