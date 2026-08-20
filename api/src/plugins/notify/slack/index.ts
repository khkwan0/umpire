import type {NotifierPlugin} from '../../types.js'
import {
  isConfigured,
  readDefaults,
  resolveSlackConfigForTarget,
} from './config.js'
import {registerSlackRoutes} from './routes.js'
import {sendAlert} from './send.js'

const slackNotifier: NotifierPlugin = {
  id: 'slack',
  description: 'Sends alerts to a Slack channel via incoming webhook.',
  init(): void {
    const config = readDefaults()
    if (isConfigured(config)) console.log('[notify:slack] initialized')
    else
      console.warn(
        '[notify:slack] no webhookUrl configured; set defaults in UI',
      )
  },
  isReady(): boolean {
    return isConfigured(readDefaults())
  },
  async registerRoutes(app) {
    await registerSlackRoutes(app)
  },
  async notify(ctx) {
    const config = resolveSlackConfigForTarget(ctx.config)
    if (!isConfigured(config)) return
    await sendAlert(config, ctx.event)
  },
}

export default slackNotifier
