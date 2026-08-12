import Fastify from 'fastify'
import { initDb } from './db.js'
import { initFcm } from './fcm.js'
import { startChecker } from './checker.js'
import { targetsRoutes } from './routes/targets.js'
import { tokensRoutes } from './routes/tokens.js'
import { settingsRoutes } from './routes/settings.js'
import { statusRoutes } from './routes/status.js'

const port = Number(process.env.PORT) || 3000
const databasePath = process.env.DATABASE_PATH || './data/monitor.sqlite'

async function main() {
  initDb(databasePath)
  initFcm()

  const app = Fastify({ logger: true })

  app.get('/api/health', async () => ({ ok: true }))

  await app.register(targetsRoutes)
  await app.register(tokensRoutes)
  await app.register(settingsRoutes)
  await app.register(statusRoutes)

  await app.listen({ port, host: '0.0.0.0' })
  startChecker()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
