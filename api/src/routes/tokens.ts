import type { FastifyInstance } from 'fastify'
import { createToken, deleteToken, listTokens } from '../db.js'

export async function tokensRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/tokens', async () => listTokens())

  app.post<{ Body: { token?: string; label?: string } }>(
    '/api/tokens',
    async (req, reply) => {
      const token = req.body?.token?.trim()
      const label = (req.body?.label ?? '').trim()
      if (!token) return reply.code(400).send({ error: 'token required' })
      try {
        const row = createToken(token, label)
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

  app.delete<{ Params: { id: string } }>('/api/tokens/:id', async (req, reply) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'invalid id' })
    const ok = deleteToken(id)
    if (!ok) return reply.code(404).send({ error: 'not found' })
    return reply.code(204).send()
  })
}
