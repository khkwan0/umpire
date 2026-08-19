import type { FastifyInstance } from 'fastify'
import { HTTP_METHODS, normalizeConfig, readConfig, writeConfig } from './config.js'

const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const

const configSchema = {
  type: 'object',
  required: ['method', 'headers', 'body'],
  properties: {
    method: { type: 'string', enum: [...HTTP_METHODS] },
    headers: { type: 'object', additionalProperties: { type: 'string' } },
    body: { type: 'string' },
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

  app.put<{ Body: { method?: string; headers?: Record<string, string>; body?: string } }>(
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
        req.body?.body !== undefined
      ) {
        config = normalizeConfig({
          method: req.body.method ?? base.method,
          headers: req.body.headers ?? base.headers,
          body: req.body.body ?? base.body,
        })
      }

      const startedAt = Date.now()
      const timeout = Number(process.env.CHECK_TIMEOUT_MS)
      const timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : 10_000
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const headers: Record<string, string> = {
          'user-agent': 'umpire/1.0',
          ...config.headers,
        }
        const useBody = !['GET', 'HEAD'].includes(config.method)
        const res = await fetch(url, {
          method: config.method,
          redirect: 'follow',
          signal: controller.signal,
          headers,
          body: useBody && config.body ? config.body : undefined,
        })
        const latencyMs = Date.now() - startedAt
        const ok = res.status === 200
        return {
          ok,
          statusCode: res.status,
          error: ok ? null : `HTTP ${res.status}`,
          latencyMs,
        }
      } catch (err) {
        const latencyMs = Date.now() - startedAt
        const message =
          err instanceof Error
            ? err.name === 'AbortError'
              ? 'timeout'
              : err.message
            : String(err)
        return { ok: false, statusCode: null, error: message, latencyMs }
      } finally {
        clearTimeout(timer)
      }
    },
  )
}
