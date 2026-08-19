import type { AlertEvent, NotifierPlugin } from '../../types.js'
import { isConfigured, readConfig } from './config.js'
import { registerEmailRoutes } from './routes.js'
import { sendAlert } from './send.js'

const emailNotifier: NotifierPlugin = {
  id: 'email',
  init(): void {
    const config = readConfig()
    if (isConfigured(config)) console.log('[notify:email] initialized')
    else console.warn('[notify:email] missing from/to config; set /api/plugins/notify/email/config')
  },
  isReady(): boolean {
    return isConfigured(readConfig())
  },
  async registerRoutes(app) {
    await registerEmailRoutes(app)
  },
  async notify(event: AlertEvent): Promise<void> {
    const config = readConfig()
    if (!isConfigured(config)) return
    await sendAlert(config, event)
  },
}

export default emailNotifier
