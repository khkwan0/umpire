import type { FastifyInstance } from 'fastify'
import { getScheduler, getStore } from '../plugins/registry.js'

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export async function targetsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/targets', async () => getStore().listTargets())

  app.post<{
    Body: { url?: string; interval_seconds?: number; enabled?: boolean }
  }>('/api/targets', async (req, reply) => {
    const url = req.body?.url?.trim()
    const interval = Number(req.body?.interval_seconds ?? 60)
    const enabled = req.body?.enabled !== false
    if (!url || !isValidUrl(url)) {
      return reply.code(400).send({ error: 'valid http(s) url required' })
    }
    if (!Number.isFinite(interval) || interval < 5) {
      return reply.code(400).send({ error: 'interval_seconds must be >= 5' })
    }
    const target = getStore().createTarget(url, interval, enabled)
    getScheduler().reschedule()
    return reply.code(201).send(target)
  })

  app.patch<{
    Params: { id: string }
    Body: { url?: string; interval_seconds?: number; enabled?: boolean }
  }>('/api/targets/:id', async (req, reply) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'invalid id' })
    if (req.body?.url !== undefined && !isValidUrl(req.body.url)) {
      return reply.code(400).send({ error: 'valid http(s) url required' })
    }
    if (
      req.body?.interval_seconds !== undefined &&
      (!Number.isFinite(req.body.interval_seconds) || req.body.interval_seconds < 5)
    ) {
      return reply.code(400).send({ error: 'interval_seconds must be >= 5' })
    }
    const updated = getStore().updateTarget(id, req.body ?? {})
    if (!updated) return reply.code(404).send({ error: 'not found' })
    getScheduler().reschedule()
    return updated
  })

  app.delete<{ Params: { id: string } }>('/api/targets/:id', async (req, reply) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'invalid id' })
    const ok = getStore().deleteTarget(id)
    if (!ok) return reply.code(404).send({ error: 'not found' })
    getScheduler().reschedule()
    return reply.code(204).send()
  })

  app.get<{ Params: { id: string } }>(
    '/api/targets/:id/results',
    async (req, reply) => {
      const id = Number(req.params.id)
      if (!Number.isInteger(id)) return reply.code(400).send({ error: 'invalid id' })
      if (!getStore().getTarget(id)) return reply.code(404).send({ error: 'not found' })
      return getStore().listRecentResults(id, 100)
    },
  )
}
