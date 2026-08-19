import type { FastifyInstance } from 'fastify'
import {
  HTTP_METHODS,
  STATUS_RANGES,
  normalizeConfig,
  readConfig,
  writeConfig,
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
    '/config',
    {
      schema: {
        tags: ['http-check'],
        summary: 'Get HTTP check plugin config',
        response: { 200: configSchema },
      },
    },
    async () => readConfig(),
  )

  app.put<{
    Body: {
      method?: string
      headers?: Record<string, string>
      body?: string
      acceptedStatusRanges?: string[]
      maxLatencyMs?: number | null
    }
  }>(
    '/config',
    {
      schema: {
        tags: ['http-check'],
        summary: 'Set HTTP check plugin config',
        body: configSchema,
        response: {
          200: configSchema,
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return writeConfig(normalizeConfig(req.body))
      } catch (err) {
        return reply
          .code(400)
          .send({ error: err instanceof Error ? err.message : String(err) })
      }
    },
  )

  app.post<{
    Body: {
      url?: string
      method?: string
      headers?: Record<string, string>
      body?: string
      acceptedStatusRanges?: string[]
      maxLatencyMs?: number | null
    }
  }>(
    '/test',
    {
      schema: {
        tags: ['http-check'],
        summary:
          'Run one HTTP check now using current or provided method/headers/body',
        body: {
          type: 'object',
          required: ['url'],
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
        },
      },
    },
    async (req, reply) => {
      const url = req.body?.url?.trim()
      if (!url) {
        return reply.code(400).send({ error: 'url is required' })
      }
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return reply.code(400).send({ error: 'url must be http(s)' })
        }
      } catch {
        return reply.code(400).send({ error: 'url is invalid' })
      }

      const base = readConfig()
      let config = base
      if (
        req.body?.method !== undefined ||
        req.body?.headers !== undefined ||
        req.body?.body !== undefined ||
        req.body?.acceptedStatusRanges !== undefined ||
        req.body?.maxLatencyMs !== undefined
      ) {
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
      }
      return runHttpCheck(url, config)
    },
  )
}
