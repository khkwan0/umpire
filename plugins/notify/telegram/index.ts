import type {NotifierPlugin} from '../../../api/src/plugins/types.js'
import {
  isConfigured,
  readDefaults,
  resolveTelegramConfigForTarget,
} from './config.js'
import {registerTelegramRoutes} from './routes.js'
import {sendAlert} from './send.js'

const telegramNotifier: NotifierPlugin = {
  id: 'telegram',
  description: 'Sends alerts to a Telegram chat via bot.',
  init(): void {
    const config = readDefaults()
    if (isConfigured(config)) console.log('[notify:telegram] initialized')
    else console.warn('[notify:telegram] not configured; set defaults in UI')
  },
  isReady(): boolean {
    return isConfigured(readDefaults())
  },
  async registerRoutes(app) {
    await registerTelegramRoutes(app)
  },
  async notify(ctx) {
    const config = resolveTelegramConfigForTarget(ctx.config)
    if (!isConfigured(config)) return
    await sendAlert(config, ctx.event)
  },
}

export default telegramNotifier
