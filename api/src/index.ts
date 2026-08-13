import Fastify from 'fastify'
import { initPlugins, getScheduler, getStore } from './plugins/registry.js'
import { runCheck } from './pipeline.js'
import { registerOpenApi } from './openapi.js'
import { targetsRoutes } from './routes/targets.js'
import { groupsRoutes } from './routes/groups.js'
import { tokensRoutes } from './routes/tokens.js'
import { settingsRoutes } from './routes/settings.js'
import { statusRoutes } from './routes/status.js'

const port = Number(process.env.PORT) || 3000
const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'

async function main() {
  await initPlugins(databasePath)

  getScheduler().init?.({
    getTargets: () =>
      getStore()
        .listTargets()
        .map((t) => ({
          id: t.id,
          intervalSeconds: t.interval_seconds,
          enabled: Boolean(t.enabled),
        })),
    run: (targetId) => runCheck(targetId),
  })

  const app = Fastify({ logger: true })

  await registerOpenApi(app)

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

  await app.register(targetsRoutes)
  await app.register(groupsRoutes)
  await app.register(tokensRoutes)
  await app.register(settingsRoutes)
  await app.register(statusRoutes)

  await app.listen({ port, host: '0.0.0.0' })
  getScheduler().start()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
