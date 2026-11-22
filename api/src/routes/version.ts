import type {FastifyInstance} from 'fastify'
import {API_VERSION} from '../version.js'

export async function versionRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/version',
    {
      schema: {
        tags: ['health'],
        summary: 'API version',
        response: {
          200: {
            type: 'object',
            required: ['api'],
            properties: {api: {type: 'string'}},
          },
        },
      },
    },
    async () => ({api: API_VERSION}),
  )
}
