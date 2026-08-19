import type { FastifyInstance } from 'fastify'
import { getCore } from '../../../core/index.js'
import {
  HTTP_METHODS,
  STATUS_RANGES,
  normalizeConfig,
  resolveHttpCheckConfig,
} from './config.js'
import { runHttpCheck } from './evaluate.js'

const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const

const configSchema = {
  type: 'object',
  required: ['method', 'headers', 'body', 'acceptedStatusRanges', 'maxLatencyMs'],
  properties: {
    method: { type: 'string', enum: [...HTTP_METHODS] },
    headers: { type: 'object', additionalProperties: { type: 'string' } },
    body: { type: 'string' },
    acceptedStatusRanges: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', enum: [...STATUS_RANGES] },
    },
    maxLatencyMs: { type: ['integer', 'null'], minimum: 1 },
  },
} as const

export async function registerHttpCheckRoutes(
  app: FastifyInstance,
): Promise<void> {
  const testSchema = {
    type: 'object',
    required: ['ok', 'statusCode', 'error', 'latencyMs'],
    properties: {
      ok: { type: 'boolean' },
      statusCode: { type: ['integer', 'null'] },
      error: { type: ['string', 'null'] },
      latencyMs: { type: 'number' },
    },
  } as const

  app.get(
    '/targets/:targetId/config',
    {
      schema: {
        tags: ['http-check'],
        summary: 'Get HTTP check config for one target',
        params: {
          type: 'object',
          required: ['targetId'],
          properties: { targetId: { type: 'string' } },
        },
        response: {
          200: configSchema,
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const targetId = Number((req.params as { targetId: string }).targetId)
      if (!Number.isInteger(targetId) || targetId < 1) {
        return reply.code(400).send({ error: 'invalid targetId' })
      }
      if (!getCore().getTarget(targetId)) {
        return reply.code(404).send({ error: 'target not found' })
      }
      return resolveHttpCheckConfig(
        getCore().getTargetCheckConfig(targetId, 'http'),
      )
    },
  )

  app.put<{
    Params: { targetId: string }
    Body: {
      method?: string
      headers?: Record<string, string>
      body?: string
      acceptedStatusRanges?: string[]
      maxLatencyMs?: number | null
    }
  }>(
    '/targets/:targetId/config',
    {
      schema: {
        tags: ['http-check'],
        summary: 'Set HTTP check config for one target',
        params: {
          type: 'object',
          required: ['targetId'],
          properties: { targetId: { type: 'string' } },
        },
        body: configSchema,
        response: {
          200: configSchema,
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const targetId = Number(req.params.targetId)
      if (!Number.isInteger(targetId) || targetId < 1) {
        return reply.code(400).send({ error: 'invalid targetId' })
      }
      if (!getCore().getTarget(targetId)) {
        return reply.code(404).send({ error: 'target not found' })
      }
      try {
        const config = normalizeConfig(req.body)
        getCore().setTargetCheckConfig(targetId, 'http', config)
        return config
      } catch (err) {
        return reply
          .code(400)
          .send({ error: err instanceof Error ? err.message : String(err) })
      }
    },
  )

  app.post<{
    Params: { targetId: string }
    Body: {
      url?: string
      method?: string
      headers?: Record<string, string>
      body?: string
      acceptedStatusRanges?: string[]
      maxLatencyMs?: number | null
    }
  }>(
    '/targets/:targetId/test',
    {
      schema: {
        tags: ['http-check'],
        summary: 'Run one HTTP check now using target config and optional overrides',
        params: {
          type: 'object',
          required: ['targetId'],
          properties: { targetId: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri' },
            method: { type: 'string', enum: [...HTTP_METHODS] },
            headers: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
            body: { type: 'string' },
            acceptedStatusRanges: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', enum: [...STATUS_RANGES] },
            },
            maxLatencyMs: { type: ['integer', 'null'], minimum: 1 },
          },
        },
        response: {
          200: testSchema,
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const targetId = Number(req.params.targetId)
      if (!Number.isInteger(targetId) || targetId < 1) {
        return reply.code(400).send({ error: 'invalid targetId' })
      }
      const target = getCore().getTarget(targetId)
      if (!target) {
        return reply.code(404).send({ error: 'target not found' })
      }
      const url = req.body?.url?.trim() || target.url
      const base = resolveHttpCheckConfig(
        getCore().getTargetCheckConfig(targetId, 'http'),
      )
      let config = base
      if (
        req.body?.method !== undefined ||
        req.body?.headers !== undefined ||
        req.body?.body !== undefined ||
        req.body?.acceptedStatusRanges !== undefined ||
        req.body?.maxLatencyMs !== undefined
      ) {
        try {
          config = normalizeConfig({
            method: req.body.method ?? base.method,
            headers: req.body.headers ?? base.headers,
            body: req.body.body ?? base.body,
            acceptedStatusRanges:
              req.body.acceptedStatusRanges ?? base.acceptedStatusRanges,
            maxLatencyMs:
              req.body.maxLatencyMs !== undefined
                ? req.body.maxLatencyMs
                : base.maxLatencyMs,
          })
        } catch (err) {
          return reply
            .code(400)
            .send({ error: err instanceof Error ? err.message : String(err) })
        }
      }
      return runHttpCheck(url, config)
    },
  )
}
