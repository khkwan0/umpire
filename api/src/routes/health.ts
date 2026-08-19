import type { FastifyInstance } from 'fastify'

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Health check',
        response: {
          200: {
            type: 'object',
            required: ['ok'],
            properties: { ok: { type: 'boolean' } },
          },
        },
      },
    },
    async () => ({ ok: true }),
  )
}
