import type {FastifyInstance} from 'fastify'
import {getChecks} from '../plugins/registry.js'

export async function checksRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/checks',
    {
      schema: {
        tags: ['checks'],
        summary: 'List loaded check plugins',
        description:
          'Ids available for target check_ids allowlists. Empty check_ids on a target means all of these run.',
        response: {
          200: {
            type: 'array',
            items: {$ref: 'PluginRef#'},
          },
        },
      },
    },
    async () => getChecks().map(c => ({id: c.id})),
  )
}
