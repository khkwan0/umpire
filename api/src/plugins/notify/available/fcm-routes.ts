import type { FastifyInstance } from 'fastify'
import {
  createToken,
  deleteToken,
  listTokens,
  normalizeCheckIds,
  normalizeTargetIds,
  updateToken,
} from './fcm-tokens.js'

const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const

const targetIdsSchema = {
  type: 'array',
  items: { type: 'integer', minimum: 1 },
  description: 'Target ids to receive. Empty = all targets.',
} as const

const checkIdsSchema = {
  type: 'array',
  items: { type: 'string', minLength: 1 },
  description:
    'Check plugin ids this token cares about. Empty = any alert (incl. recovery). Non-empty = only when a listed check failed.',
} as const

export async function registerFcmRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/tokens',
    {
      schema: {
        tags: ['tokens'],
        summary: 'List FCM tokens',
        description:
          'Owned by the fcm notifier. Mounted at /api/plugins/notify/fcm/tokens. Each token may restrict targets and checks.',
        response: {
          200: { type: 'array', items: { $ref: 'FcmToken#' } },
        },
      },
    },
    async () => listTokens(),
  )

  app.post<{
    Body: {
      token?: string
      label?: string
      target_ids?: number[]
      check_ids?: string[]
    }
  }>(
    '/tokens',
    {
      schema: {
        tags: ['tokens'],
        summary: 'Add FCM token',
        body: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
            label: { type: 'string' },
            target_ids: targetIdsSchema,
            check_ids: checkIdsSchema,
          },
        },
        response: {
          201: { $ref: 'FcmToken#' },
          400: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const token = req.body?.token?.trim()
      const label = (req.body?.label ?? '').trim()
      if (!token) return reply.code(400).send({ error: 'token required' })
      try {
        const targetIds = normalizeTargetIds(req.body?.target_ids)
        const checkIds = normalizeCheckIds(req.body?.check_ids)
        const row = createToken(token, label, targetIds, checkIds)
        return reply.code(201).send(row)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('UNIQUE') || message.includes('already exists')) {
          return reply.code(409).send({ error: 'token already exists' })
        }
        return reply.code(400).send({ error: message })
      }
    },
  )

  app.patch<{
    Params: { id: string }
    Body: {
      label?: string
      enabled?: boolean
      target_ids?: number[]
      check_ids?: string[]
    }
  }>(
    '/tokens/:id',
    {
      schema: {
        tags: ['tokens'],
        summary: 'Update FCM token',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            enabled: { type: 'boolean' },
            target_ids: targetIdsSchema,
            check_ids: checkIdsSchema,
          },
        },
        response: {
          200: { $ref: 'FcmToken#' },
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      if (!Number.isInteger(id)) {
        return reply.code(400).send({ error: 'invalid id' })
      }
      try {
        const patch: {
          label?: string
          enabled?: boolean
          target_ids?: number[]
          check_ids?: string[]
        } = {}
        if (req.body?.label !== undefined) patch.label = req.body.label
        if (req.body?.enabled !== undefined) patch.enabled = req.body.enabled
        if (req.body?.target_ids !== undefined) {
          patch.target_ids = normalizeTargetIds(req.body.target_ids)
        }
        if (req.body?.check_ids !== undefined) {
          patch.check_ids = normalizeCheckIds(req.body.check_ids)
        }
        const updated = updateToken(id, patch)
        if (!updated) return reply.code(404).send({ error: 'not found' })
        return updated
      } catch (err) {
        return reply
          .code(400)
          .send({ error: err instanceof Error ? err.message : String(err) })
      }
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/tokens/:id',
    {
      schema: {
        tags: ['tokens'],
        summary: 'Delete FCM token',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: {
          204: { type: 'null', description: 'Deleted' },
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      if (!Number.isInteger(id)) {
        return reply.code(400).send({ error: 'invalid id' })
      }
      const ok = deleteToken(id)
      if (!ok) return reply.code(404).send({ error: 'not found' })
      return reply.code(204).send()
    },
  )
}
