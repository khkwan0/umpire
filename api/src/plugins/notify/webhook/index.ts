import type { AlertEvent, NotifierPlugin } from '../../types.js'
import { isConfigured, readConfig, seedFromEnvIfNeeded } from './config.js'
import { registerWebhookRoutes } from './routes.js'
import { postAlert } from './send.js'

const webhookNotifier: NotifierPlugin = {
  id: 'webhook',

  init(): void {
    seedFromEnvIfNeeded()
    const config = readConfig()
    if (isConfigured(config)) {
      console.log('[notify:webhook] initialized')
    } else {
      console.warn(
        '[notify:webhook] no URL configured; set it in the Webhook UI (or GET/PUT /api/plugins/notify/webhook/config)',
      )
    }
  },

  isReady(): boolean {
    return isConfigured(readConfig())
  },

  async registerRoutes(app) {
    await registerWebhookRoutes(app)
  },

  async notify(event: AlertEvent): Promise<void> {
    const config = readConfig()
    if (!isConfigured(config)) {
      console.warn('[notify:webhook] skip send — URL not configured')
      return
    }
    await postAlert(config, event)
  },
}

export default webhookNotifier
