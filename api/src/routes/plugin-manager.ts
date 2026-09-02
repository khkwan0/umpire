import type {FastifyInstance} from 'fastify'
import {pluginManagerState, setPluginEnabled} from '../plugins/manager.js'
import {
  getAuth,
  getChecks,
  getNotifiers,
  getScheduler,
} from '../plugins/registry.js'
import {publishRealtime} from '../realtime.js'

const errorResponse = {
  type: 'object',
  properties: {error: {type: 'string'}},
} as const

export async function pluginManagerRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/plugin-manager',
    {
      schema: {
        tags: ['plugins'],
        summary: 'Get runtime plugin enable/disable state',
        response: {
          200: {$ref: 'PluginManagerState#'},
        },
      },
    },
    async () => pluginManagerState(),
  )

  app.put<{
    Params: {kind: string; id: string}
    Body: {enabled?: boolean}
  }>(
    '/api/plugin-manager/:kind/:id',
    {
      schema: {
        tags: ['plugins'],
        summary: 'Enable/disable a loaded plugin at runtime',
        params: {
          type: 'object',
          required: ['kind', 'id'],
          properties: {
            kind: {
              type: 'string',
              enum: ['auth', 'check', 'notify', 'scheduler'],
            },
            id: {type: 'string'},
          },
        },
        body: {
          type: 'object',
          required: ['enabled'],
          properties: {
            enabled: {type: 'boolean'},
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['ok'],
            properties: {
              ok: {type: 'boolean'},
              restart_required: {type: 'boolean'},
            },
          },
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const kind = req.params.kind
      const id = req.params.id
      const enabled = req.body?.enabled
      if (typeof enabled !== 'boolean') {
        return reply.code(400).send({error: 'enabled must be boolean'})
      }

      if (kind === 'auth') {
        const auth = getAuth()
        if (!auth || auth.id !== id) {
          return reply.code(404).send({error: 'auth plugin not loaded'})
        }
        setPluginEnabled('auth', id, enabled)
        publishRealtime('plugin-manager.updated', {
          kind: 'auth',
          id,
          enabled,
        })
        return {ok: true, restart_required: enabled}
      }
      if (kind === 'check') {
        if (!getChecks().some(c => c.id === id)) {
          return reply.code(404).send({error: 'check plugin not loaded'})
        }
        setPluginEnabled('check', id, enabled)
        publishRealtime('plugin-manager.updated', {
          kind: 'check',
          id,
          enabled,
        })
        publishRealtime('status.updated', {reason: 'plugin-manager'})
        return {ok: true}
      }
      if (kind === 'notify') {
        if (!getNotifiers().some(n => n.id === id)) {
          return reply.code(404).send({error: 'notifier plugin not loaded'})
        }
        setPluginEnabled('notify', id, enabled)
        publishRealtime('plugin-manager.updated', {
          kind: 'notify',
          id,
          enabled,
        })
        publishRealtime('status.updated', {reason: 'plugin-manager'})
        return {ok: true}
      }
      if (kind === 'scheduler') {
        const scheduler = getScheduler()
        if (scheduler.id !== id) {
          return reply.code(404).send({error: 'scheduler plugin not loaded'})
        }
        setPluginEnabled('scheduler', id, enabled)
        if (enabled) {
          scheduler.start()
          scheduler.reschedule()
        } else {
          scheduler.stop()
        }
        publishRealtime('plugin-manager.updated', {
          kind: 'scheduler',
          id,
          enabled,
        })
        publishRealtime('status.updated', {reason: 'plugin-manager'})
        return {ok: true}
      }

      return reply
        .code(400)
        .send({error: 'kind must be auth|check|notify|scheduler'})
    },
  )
}
