import Fastify from 'fastify'
import { initCore, getCore } from './core/index.js'
import {
  initPlugins,
  getScheduler,
  getChecks,
  getNotifiers,
} from './plugins/registry.js'
import { mountAllPluginRoutes } from './plugins/routes.js'
import { runCheck } from './pipeline.js'
import { registerOpenApi } from './openapi.js'
import { healthRoutes } from './routes/health.js'
import { targetsRoutes } from './routes/targets.js'
import { groupsRoutes } from './routes/groups.js'
import { settingsRoutes } from './routes/settings.js'
import { statusRoutes } from './routes/status.js'
import { incidentsRoutes } from './routes/incidents.js'
import { streamRoutes } from './routes/stream.js'
import { schemaRoutes } from './routes/schema.js'
import { checksRoutes } from './routes/checks.js'
import { notifiersRoutes } from './routes/notifiers.js'
import { pluginsRoutes } from './routes/plugins.js'
import { pluginManagerRoutes } from './routes/plugin-manager.js'

const port = Number(process.env.PORT) || 3000
const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'

async function main() {
  initCore(databasePath)
  await initPlugins()

  getScheduler().init?.({
    getTargets: () =>
      getCore()
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

  await app.register(healthRoutes)
  await app.register(targetsRoutes)
  await app.register(groupsRoutes)
  await app.register(settingsRoutes)
  await app.register(statusRoutes)
  await app.register(incidentsRoutes)
  await app.register(streamRoutes)
  await app.register(schemaRoutes)
  await app.register(checksRoutes)
  await app.register(notifiersRoutes)
  await app.register(pluginManagerRoutes)
  await mountAllPluginRoutes(app, {
    checks: getChecks(),
    scheduler: getScheduler(),
    notifiers: getNotifiers(),
  })
  // After plugin mounts so the catalog is populated
  await app.register(pluginsRoutes)

  await app.listen({ port, host: '0.0.0.0' })
  getScheduler().start()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
