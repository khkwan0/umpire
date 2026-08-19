import type { FastifyInstance } from 'fastify'
import { subscribeRealtime } from '../realtime.js'

export async function streamRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/stream',
    {
      schema: {
        tags: ['status'],
        summary: 'Server-sent event stream for UI live updates',
      },
    },
    async (_req, reply) => {
      reply.raw.setHeader('Content-Type', 'text/event-stream')
      reply.raw.setHeader('Cache-Control', 'no-cache')
      reply.raw.setHeader('Connection', 'keep-alive')
      reply.raw.setHeader('X-Accel-Buffering', 'no')
      reply.hijack()

      const writeEvent = (event: string, data: unknown) => {
        reply.raw.write(`event: ${event}\n`)
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
      }

      writeEvent('connected', { ok: true, at: new Date().toISOString() })
      const unsubscribe = subscribeRealtime((event, data) => {
        writeEvent(event, { ...((data as object) ?? {}), at: new Date().toISOString() })
      })

      const heartbeat = setInterval(() => {
        writeEvent('heartbeat', { ok: true })
      }, 15000)

      reply.raw.on('close', () => {
        clearInterval(heartbeat)
        unsubscribe()
      })
    },
  )

}
