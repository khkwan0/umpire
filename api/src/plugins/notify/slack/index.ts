import type { AlertEvent, NotifierPlugin } from '../../types.js'
import { isConfigured, readConfig } from './config.js'
import { registerSlackRoutes } from './routes.js'
import { sendAlert } from './send.js'

const slackNotifier: NotifierPlugin = {
  id: 'slack',
  init(): void {
    const config = readConfig()
    if (isConfigured(config)) console.log('[notify:slack] initialized')
    else console.warn('[notify:slack] no webhookUrl configured; set /api/plugins/notify/slack/config')
  },
  isReady(): boolean {
    return isConfigured(readConfig())
  },
  async registerRoutes(app) {
    await registerSlackRoutes(app)
  },
  async notify(event: AlertEvent): Promise<void> {
    const config = readConfig()
    if (!isConfigured(config)) return
    await sendAlert(config, event)
  },
}

export default slackNotifier
