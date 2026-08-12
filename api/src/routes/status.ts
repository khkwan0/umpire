import type { FastifyInstance } from 'fastify'
import { getSettings, getStatusSummary } from '../db.js'
import { isFcmReady } from '../fcm.js'

export async function statusRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/status', async () => {
    const targets = getStatusSummary()
    const settings = getSettings()
    return {
      fcm_ready: isFcmReady(),
      settings,
      targets,
    }
  })
}
