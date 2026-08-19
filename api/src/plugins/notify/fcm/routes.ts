import type { FastifyInstance } from 'fastify'
import {
  createToken,
  deleteToken,
  getToken,
  importTokens,
  listTokens,
  normalizeCheckIds,
  normalizeTargetIds,
  recordTokenTest,
  updateToken,
} from './tokens.js'
import { isUnregisteredTokenError, sendToMany, testPushCopy } from './send.js'

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

const fcmTokenTestSchema = {
  type: 'object',
  required: ['ok', 'error'],
  properties: {
    ok: { type: 'boolean' },
    error: { type: ['string', 'null'] },
  },
} as const

function destinationFromBody(
  body: { fid?: string; token?: string } | undefined,
): string {
  return (body?.fid ?? body?.token ?? '').trim()
}

export async function registerFcmRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/tokens',
    {
      schema: {
        tags: ['tokens'],
        summary:
          'List FCM destinations (FID preferred; legacy registration tokens still stored)',
        description:
          'Owned by the fcm notifier. Mounted at /api/plugins/notify/fcm/tokens. Each destination may restrict targets and checks. Send uses fid unless the value looks like a legacy :APA91 registration token.',
        response: {
          200: { type: 'array', items: { $ref: 'FcmToken#' } },
        },
      },
    },
    async () => listTokens(),
  )

  app.post(
    '/tokens/import',
    {
      schema: {
        tags: ['tokens'],
        summary: 'Import FCM FIDs (or legacy tokens) from a JSON array',
        description:
          'Body is { "fids": [...] } or { "tokens": [...] }. Each item may be a FID string or { fid|token, label?, target_ids?, check_ids? }. Duplicates are skipped.',
        body: {
          type: 'object',
          properties: {
            fids: {
              type: 'array',
              minItems: 1,
              items: {
                oneOf: [
                  { type: 'string' },
                  {
                    type: 'object',
                    properties: {
                      fid: { type: 'string' },
                      token: { type: 'string' },
                      label: { type: 'string' },
                      target_ids: targetIdsSchema,
                      check_ids: checkIdsSchema,
                    },
                  },
                ],
              },
            },
            tokens: {
              type: 'array',
              minItems: 1,
              items: {
                oneOf: [
                  { type: 'string' },
                  {
                    type: 'object',
                    properties: {
                      fid: { type: 'string' },
                      token: { type: 'string' },
                      label: { type: 'string' },
                      target_ids: targetIdsSchema,
                      check_ids: checkIdsSchema,
                    },
                  },
                ],
              },
            },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['created', 'skipped'],
            properties: {
              created: { type: 'array', items: { $ref: 'FcmToken#' } },
              skipped: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['token', 'reason'],
                  properties: {
                    token: { type: 'string' },
                    reason: { type: 'string' },
                  },
                },
              },
            },
          },
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return importTokens(req.body)
      } catch (err) {
        return reply
          .code(400)
          .send({ error: err instanceof Error ? err.message : String(err) })
      }
    },
  )

  app.post<{ Body: { fid?: string; token?: string } }>(
    '/tokens/test',
    {
      schema: {
        tags: ['tokens'],
        summary:
          'Send a test push to a raw FID or legacy token (does not persist)',
        body: {
          type: 'object',
          properties: {
            fid: { type: 'string' },
            token: { type: 'string' },
          },
        },
        response: {
          200: fcmTokenTestSchema,
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const destination = destinationFromBody(req.body)
      if (!destination) {
        return reply.code(400).send({ error: 'fid or token required' })
      }
      const copy = testPushCopy(destination)
      const res = await sendToMany([destination], copy.title, copy.body)
      return {
        ok: res.successCount > 0,
        error: res.errors[0] ?? null,
      }
    },
  )

  app.post<{ Params: { id: string } }>(
    '/tokens/:id/test',
    {
      schema: {
        tags: ['tokens'],
        summary:
          'Send a test push to a stored FID or legacy token and record the result',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
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
      const row = getToken(id)
      if (!row) return reply.code(404).send({ error: 'not found' })
      const copy = testPushCopy(row.token)
      const result = await sendToMany([row.token], copy.title, copy.body)
      const ok = result.successCount > 0
      const error = result.errors[0] ?? null
      const updated = ok
        ? recordTokenTest(id, 'sent', null)
        : recordTokenTest(id, 'error', error, {
            enabled: isUnregisteredTokenError(error || '') ? false : undefined,
          })
      if (!updated) return reply.code(404).send({ error: 'not found' })
      return updated
    },
  )

  app.post<{ Params: { id: string }; Body: { received?: boolean } }>(
    '/tokens/:id/received',
    {
      schema: {
        tags: ['tokens'],
        summary: 'Confirm whether a test push actually appeared on the device',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['received'],
          properties: { received: { type: 'boolean' } },
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
      if (typeof req.body?.received !== 'boolean') {
        return reply.code(400).send({ error: 'received required' })
      }
      const updated = req.body.received
        ? recordTokenTest(id, 'ok', null)
        : recordTokenTest(id, 'error', 'not received', { enabled: false })
      if (!updated) return reply.code(404).send({ error: 'not found' })
      return updated
    },
  )

  app.post<{
    Body: {
      fid?: string
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
        summary: 'Add an FCM FID (or legacy registration token)',
        body: {
          type: 'object',
          properties: {
            fid: { type: 'string' },
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
      const destination = destinationFromBody(req.body)
      const label = (req.body?.label ?? '').trim()
      if (!destination) {
        return reply.code(400).send({ error: 'fid or token required' })
      }
      try {
        const targetIds = normalizeTargetIds(req.body?.target_ids)
        const checkIds = normalizeCheckIds(req.body?.check_ids)
        const row = createToken(destination, label, targetIds, checkIds)
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
      fid?: string
      token?: string
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
        summary: 'Update FCM destination (label, FID/token, enabled, filters)',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            fid: { type: 'string' },
            token: { type: 'string' },
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
          409: errorResponse,
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
          token?: string
          label?: string
          enabled?: boolean
          target_ids?: number[]
          check_ids?: string[]
        } = {}
        if (req.body?.fid !== undefined || req.body?.token !== undefined) {
          const destination = destinationFromBody(req.body)
          if (!destination) {
            return reply.code(400).send({ error: 'fid or token required' })
          }
          patch.token = destination
        }
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
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('UNIQUE') || message.includes('already exists')) {
          return reply.code(409).send({ error: 'token already exists' })
        }
        return reply.code(400).send({ error: message })
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
