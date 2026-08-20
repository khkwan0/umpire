import type {NotifierPlugin} from '../../../api/src/plugins/types.js'
import {
  isConfigured,
  readDefaults,
  resolveEmailConfigForTarget,
} from './config.js'
import {registerEmailRoutes} from './routes.js'
import {sendAlert} from './send.js'

const emailNotifier: NotifierPlugin = {
  id: 'email',
  description: 'Sends alerts by email using sendmail or SMTP.',
  init(): void {
    const config = readDefaults()
    if (isConfigured(config)) console.log('[notify:email] initialized')
    else
      console.warn('[notify:email] missing from/to config; set defaults in UI')
  },
  isReady(): boolean {
    return isConfigured(readDefaults())
  },
  async registerRoutes(app) {
    await registerEmailRoutes(app)
  },
  async notify(ctx) {
    const config = resolveEmailConfigForTarget(ctx.config)
    if (!isConfigured(config)) return
    await sendAlert(config, ctx.event)
  },
}

export default emailNotifier
