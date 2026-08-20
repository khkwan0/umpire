import type {NotifierPlugin} from '../../types.js'
import {
  isConfigured,
  readDefaults,
  resolveWebhookConfigForTarget,
  seedFromEnvIfNeeded,
} from './config.js'
import {registerWebhookRoutes} from './routes.js'
import {sendAlert} from './send.js'

const webhookNotifier: NotifierPlugin = {
  id: 'webhook',
  description:
    'Delivers the alert payload to a configured HTTP URL using the chosen method and headers.',

  init(): void {
    seedFromEnvIfNeeded()
    const config = readDefaults()
    if (isConfigured(config)) {
      console.log('[notify:webhook] initialized')
    } else {
      console.warn(
        '[notify:webhook] no URL configured; set defaults in the Webhook UI',
      )
    }
  },

  isReady(): boolean {
    return isConfigured(readDefaults())
  },

  async registerRoutes(app) {
    await registerWebhookRoutes(app)
  },

  async notify(ctx) {
    const config = resolveWebhookConfigForTarget(ctx.config)
    if (!isConfigured(config)) {
      console.warn('[notify:webhook] skip send — URL not configured')
      return
    }
    await sendAlert(config, ctx.event)
  },
}

export default webhookNotifier
