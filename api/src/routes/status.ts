import type { FastifyInstance } from 'fastify'
import { getCore } from '../core/index.js'
import { pluginStatus } from '../plugins/registry.js'

export async function statusRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/status',
    {
      schema: {
        tags: ['status'],
        summary: 'Dashboard status summary',
        response: {
          200: { $ref: 'StatusResponse#' },
        },
      },
    },
    async () => {
      const targets = getCore().getStatusSummary()
      const settings = getCore().getSettings()
      const plugins = pluginStatus()
      return {
        ...plugins,
        settings,
        targets,
      }
    },
  )
}
