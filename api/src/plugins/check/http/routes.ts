import type { FastifyInstance } from 'fastify'
import { getCore } from '../../../core/index.js'
import { publishRealtime } from '../../../realtime.js'
import {
  HTTP_METHODS,
  STATUS_RANGES,
  buildTargetConfigView,
  normalizeConfig,
  normalizeTargetOverride,
  readDefaults,
  resolveHttpCheckConfigForTarget,
  writeDefaults,
} from './config.js'
import { runHttpCheck } from './evaluate.js'

const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const

const configSchema = {
  type: 'object',
  required: [
    'method',
    'headers',
    'body',
    'acceptedStatusRanges',
    'acceptedStatusCodes',
    'maxLatencyMs',
  ],
  properties: {
    method: { type: 'string', enum: [...HTTP_METHODS] },
    headers: { type: 'object', additionalProperties: { type: 'string' } },
    body: { type: 'string' },
    acceptedStatusRanges: {
      type: 'array',
      items: { type: 'string', enum: [...STATUS_RANGES] },
    },
    acceptedStatusCodes: {
      type: 'array',
      items: { type: 'integer', minimum: 100, maximum: 599 },
    },
    maxLatencyMs: { type: ['integer', 'null'], minimum: 1 },
  },
} as const

const targetConfigViewSchema = {
  type: 'object',
  required: ['useCustom', 'defaults', 'override', 'effective'],
  properties: {
    useCustom: { type: 'boolean' },
    defaults: configSchema,
    override: { type: ['object', 'null'], additionalProperties: true },
    effective: configSchema,
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
    '/config',
    {
      schema: {
        tags: ['http-check'],
        summary: 'Get default HTTP check parameters for all targets',
        response: { 200: configSchema },
      },
    },
    async () => readDefaults(),
  )

  app.put<{
    Body: {
      method?: string
      headers?: Record<string, string>
      body?: string
      acceptedStatusRanges?: string[]
      acceptedStatusCodes?: number[]
      maxLatencyMs?: number | null
    }
  }>(
    '/config',
    {
      schema: {
        tags: ['http-check'],
        summary: 'Set default HTTP check parameters for all targets',
        body: configSchema,
        response: {
          200: configSchema,
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        const config = writeDefaults(req.body)
        publishRealtime('plugin-manager.updated', { reason: 'http-defaults' })
        return config
      } catch (err) {
        return reply
          .code(400)
          .send({ error: err instanceof Error ? err.message : String(err) })
      }
    },
  )

  app.get(
    '/targets/:targetId/config',
    {
      schema: {
        tags: ['http-check'],
        summary: 'Get HTTP check defaults, override, and effective config for one target',
        params: {
          type: 'object',
          required: ['targetId'],
          properties: { targetId: { type: 'string' } },
        },
        response: {
          200: targetConfigViewSchema,
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
      return buildTargetConfigView(
        getCore().getTargetCheckConfig(targetId, 'http'),
      )
    },
  )

  app.put<{
    Params: { targetId: string }
    Body: {
      useCustom: boolean
      method?: string
      headers?: Record<string, string>
      body?: string
      acceptedStatusRanges?: string[]
      acceptedStatusCodes?: number[]
      maxLatencyMs?: number | null
    }
  }>(
    '/targets/:targetId/config',
    {
      schema: {
        tags: ['http-check'],
        summary: 'Set or clear per-target HTTP check override',
        params: {
          type: 'object',
          required: ['targetId'],
          properties: { targetId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['useCustom'],
          properties: {
            useCustom: { type: 'boolean' },
            ...configSchema.properties,
          },
        },
        response: {
          200: targetConfigViewSchema,
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
        if (req.body.useCustom !== true) {
          getCore().deleteTargetCheckConfig(targetId, 'http')
        } else {
          const override = normalizeTargetOverride(req.body)
          getCore().setTargetCheckConfig(targetId, 'http', override)
        }
        publishRealtime('targets.updated', {
          action: 'http-config',
          targetId,
        })
        return buildTargetConfigView(
          getCore().getTargetCheckConfig(targetId, 'http'),
        )
      } catch (err) {
        return reply
          .code(400)
          .send({ error: err instanceof Error ? err.message : String(err) })
      }
    },
  )

  app.delete(
    '/targets/:targetId/config',
    {
      schema: {
        tags: ['http-check'],
        summary: 'Clear per-target HTTP check override (use defaults)',
        params: {
          type: 'object',
          required: ['targetId'],
          properties: { targetId: { type: 'string' } },
        },
        response: {
          200: targetConfigViewSchema,
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
      getCore().deleteTargetCheckConfig(targetId, 'http')
      publishRealtime('targets.updated', {
        action: 'http-config-clear',
        targetId,
      })
      return buildTargetConfigView(null)
    },
  )

  app.post<{
    Params: { targetId: string }
    Body: {
      url?: string
      useCustom?: boolean
      method?: string
      headers?: Record<string, string>
      body?: string
      acceptedStatusRanges?: string[]
      acceptedStatusCodes?: number[]
      maxLatencyMs?: number | null
    }
  }>(
    '/targets/:targetId/test',
    {
      schema: {
        tags: ['http-check'],
        summary:
          'Run one HTTP check now using effective target config and optional overrides',
        params: {
          type: 'object',
          required: ['targetId'],
          properties: { targetId: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri' },
            useCustom: { type: 'boolean' },
            method: { type: 'string', enum: [...HTTP_METHODS] },
            headers: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
            body: { type: 'string' },
            acceptedStatusRanges: {
              type: 'array',
              items: { type: 'string', enum: [...STATUS_RANGES] },
            },
            acceptedStatusCodes: {
              type: 'array',
              items: { type: 'integer', minimum: 100, maximum: 599 },
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
      const stored = getCore().getTargetCheckConfig(targetId, 'http')
      let config = resolveHttpCheckConfigForTarget(stored)
      if (
        req.body?.useCustom === true ||
        req.body?.method !== undefined ||
        req.body?.headers !== undefined ||
        req.body?.body !== undefined ||
        req.body?.acceptedStatusRanges !== undefined ||
        req.body?.acceptedStatusCodes !== undefined ||
        req.body?.maxLatencyMs !== undefined
      ) {
        try {
          if (req.body.useCustom === false) {
            config = resolveHttpCheckConfigForTarget(null)
          } else {
            const base =
              req.body.useCustom === true
                ? readDefaults()
                : resolveHttpCheckConfigForTarget(stored)
            config = normalizeConfig({
              method: req.body.method ?? base.method,
              headers: req.body.headers ?? base.headers,
              body: req.body.body ?? base.body,
              acceptedStatusRanges:
                req.body.acceptedStatusRanges ?? base.acceptedStatusRanges,
              acceptedStatusCodes:
                req.body.acceptedStatusCodes ?? base.acceptedStatusCodes,
              maxLatencyMs:
                req.body.maxLatencyMs !== undefined
                  ? req.body.maxLatencyMs
                  : base.maxLatencyMs,
            })
          }
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
