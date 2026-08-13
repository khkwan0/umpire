import type { FastifyInstance } from 'fastify'
import { getCore } from '../core/index.js'
import { getScheduler } from '../plugins/registry.js'

const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export async function targetsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/targets',
    {
      schema: {
        tags: ['targets'],
        summary: 'List targets',
        response: {
          200: { type: 'array', items: { $ref: 'Target#' } },
        },
      },
    },
    async () => getCore().listTargets(),
  )

  app.post<{
    Body: {
      url?: string
      interval_seconds?: number
      enabled?: boolean
      group_id?: number | null
    }
  }>(
    '/api/targets',
    {
      schema: {
        tags: ['targets'],
        summary: 'Create target',
        body: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string', format: 'uri' },
            interval_seconds: { type: 'integer', minimum: 5, default: 60 },
            enabled: { type: 'boolean', default: true },
            group_id: {
              type: ['integer', 'null'],
              description: 'Child group id only (not a root)',
            },
          },
        },
        response: {
          201: { $ref: 'Target#' },
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const url = req.body?.url?.trim()
      const interval = Number(req.body?.interval_seconds ?? 60)
      const enabled = req.body?.enabled !== false
      const groupId =
        req.body?.group_id === undefined ? null : req.body.group_id
      if (!url || !isValidUrl(url)) {
        return reply.code(400).send({ error: 'valid http(s) url required' })
      }
      if (!Number.isFinite(interval) || interval < 5) {
        return reply.code(400).send({ error: 'interval_seconds must be >= 5' })
      }
      if (groupId !== null && (!Number.isInteger(groupId) || groupId < 1)) {
        return reply
          .code(400)
          .send({ error: 'group_id must be a group id or null' })
      }
      try {
        const target = getCore().createTarget(url, interval, enabled, groupId)
        getScheduler().reschedule()
        return reply.code(201).send(target)
      } catch (err) {
        return reply
          .code(400)
          .send({ error: err instanceof Error ? err.message : String(err) })
      }
    },
  )

  app.patch<{
    Params: { id: string }
    Body: {
      url?: string
      interval_seconds?: number
      enabled?: boolean
      group_id?: number | null
    }
  }>(
    '/api/targets/:id',
    {
      schema: {
        tags: ['targets'],
        summary: 'Update target',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri' },
            interval_seconds: { type: 'integer', minimum: 5 },
            enabled: { type: 'boolean' },
            group_id: { type: ['integer', 'null'] },
          },
        },
        response: {
          200: { $ref: 'Target#' },
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      if (!Number.isInteger(id)) return reply.code(400).send({ error: 'invalid id' })
      if (req.body?.url !== undefined && !isValidUrl(req.body.url)) {
        return reply.code(400).send({ error: 'valid http(s) url required' })
      }
      if (
        req.body?.interval_seconds !== undefined &&
        (!Number.isFinite(req.body.interval_seconds) ||
          req.body.interval_seconds < 5)
      ) {
        return reply.code(400).send({ error: 'interval_seconds must be >= 5' })
      }
      if (
        req.body?.group_id !== undefined &&
        req.body.group_id !== null &&
        (!Number.isInteger(req.body.group_id) || req.body.group_id < 1)
      ) {
        return reply
          .code(400)
          .send({ error: 'group_id must be a group id or null' })
      }
      try {
        const updated = getCore().updateTarget(id, req.body ?? {})
        if (!updated) return reply.code(404).send({ error: 'not found' })
        getScheduler().reschedule()
        return updated
      } catch (err) {
        return reply
          .code(400)
          .send({ error: err instanceof Error ? err.message : String(err) })
      }
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/api/targets/:id',
    {
      schema: {
        tags: ['targets'],
        summary: 'Delete target',
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
      if (!Number.isInteger(id)) return reply.code(400).send({ error: 'invalid id' })
      const ok = getCore().deleteTarget(id)
      if (!ok) return reply.code(404).send({ error: 'not found' })
      getScheduler().reschedule()
      return reply.code(204).send()
    },
  )

  app.get<{ Params: { id: string } }>(
    '/api/targets/:id/results',
    {
      schema: {
        tags: ['targets'],
        summary: 'Recent check results for a target',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: {
          200: { type: 'array', items: { $ref: 'CheckResult#' } },
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      if (!Number.isInteger(id)) return reply.code(400).send({ error: 'invalid id' })
      if (!getCore().getTarget(id)) return reply.code(404).send({ error: 'not found' })
      return getCore().listRecentResults(id, 100)
    },
  )
}
