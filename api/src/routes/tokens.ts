import type { FastifyInstance } from 'fastify'
import { getStore } from '../plugins/registry.js'

const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const

export async function tokensRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/tokens',
    {
      schema: {
        tags: ['tokens'],
        summary: 'List FCM tokens',
        response: {
          200: { type: 'array', items: { $ref: 'FcmToken#' } },
        },
      },
    },
    async () => getStore().listTokens(),
  )

  app.post<{ Body: { token?: string; label?: string } }>(
    '/api/tokens',
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
        const row = getStore().createToken(token, label)
        return reply.code(201).send(row)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('UNIQUE')) {
          return reply.code(409).send({ error: 'token already exists' })
        }
        throw err
      }
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/api/tokens/:id',
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
      if (!Number.isInteger(id)) return reply.code(400).send({ error: 'invalid id' })
      const ok = getStore().deleteToken(id)
      if (!ok) return reply.code(404).send({ error: 'not found' })
      return reply.code(204).send()
    },
  )
}
