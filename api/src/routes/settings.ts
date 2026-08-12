import type { FastifyInstance } from 'fastify'
import { getSettings, updateSettings, type AlertPolicy } from '../db.js'

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings', async () => getSettings())

  app.put<{
    Body: { alert_policy?: AlertPolicy; throttle_minutes?: number }
  }>('/api/settings', async (req, reply) => {
    try {
      return updateSettings(req.body ?? {})
    } catch (err) {
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : String(err) })
    }
  })
}
