import type { FastifyInstance } from 'fastify'
import { getStore } from '../plugins/registry.js'
import type { AlertPolicy } from '../plugins/types.js'

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings', async () => getStore().getSettings())

  app.put<{
    Body: { alert_policy?: AlertPolicy; throttle_minutes?: number }
  }>('/api/settings', async (req, reply) => {
    try {
      return getStore().updateSettings(req.body ?? {})
    } catch (err) {
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : String(err) })
    }
  })
}
