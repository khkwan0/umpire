import type { FastifyInstance } from 'fastify'
import { getChecks } from '../plugins/registry.js'

export async function checksRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/checks',
    {
      schema: {
        tags: ['checks'],
        summary: 'List loaded check plugins',
        response: {
          200: {
            type: 'array',
            items: { $ref: 'PluginRef#' },
          },
        },
      },
    },
    async () => getChecks().map((c) => ({ id: c.id })),
  )
}
