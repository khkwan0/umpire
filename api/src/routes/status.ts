import type { FastifyInstance } from 'fastify'
import { getStore, pluginStatus } from '../plugins/registry.js'

export async function statusRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/status', async () => {
    const targets = getStore().getStatusSummary()
    const settings = getStore().getSettings()
    const plugins = pluginStatus()
    return {
      ...plugins,
      settings,
      targets,
    }
  })
}
