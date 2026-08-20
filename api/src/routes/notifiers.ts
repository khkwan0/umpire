import type {FastifyInstance} from 'fastify'
import {getNotifiers} from '../plugins/registry.js'

export async function notifiersRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/notifiers',
    {
      schema: {
        tags: ['notifiers'],
        summary: 'List loaded notifier plugins',
        description:
          'Ids available for target notifier_ids allowlists (ready reflects isReady()). Empty notifier_ids on a target means all of these may receive alerts.',
        response: {
          200: {
            type: 'array',
            items: {$ref: 'NotifierStatus#'},
          },
        },
      },
    },
    async () =>
      getNotifiers().map(n => ({
        id: n.id,
        ready: n.isReady(),
      })),
  )
}
