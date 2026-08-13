import type { FastifyInstance } from 'fastify'
import { listPluginCatalog } from '../plugins/routes.js'

export async function pluginsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/plugins',
    {
      schema: {
        tags: ['plugins'],
        summary: 'List loaded plugins and their HTTP routes',
        description:
          'Each plugin is mounted under /api/plugins/<kind>/<id>. Route paths are fully qualified.',
        response: {
          200: {
            type: 'array',
            items: { $ref: 'PluginCatalogEntry#' },
          },
        },
      },
    },
    async () => listPluginCatalog(),
  )
}
