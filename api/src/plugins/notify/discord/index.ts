import type {NotifierPlugin} from '../../types.js'
import {
  isConfigured,
  readDefaults,
  resolveDiscordConfigForTarget,
} from './config.js'
import {registerDiscordRoutes} from './routes.js'
import {sendAlert} from './send.js'

const discordNotifier: NotifierPlugin = {
  id: 'discord',
  description: 'Sends alerts to a Discord channel via webhook.',
  init(): void {
    const config = readDefaults()
    if (isConfigured(config)) console.log('[notify:discord] initialized')
    else
      console.warn(
        '[notify:discord] no webhookUrl configured; set defaults in UI',
      )
  },
  isReady(): boolean {
    return isConfigured(readDefaults())
  },
  async registerRoutes(app) {
    await registerDiscordRoutes(app)
  },
  async notify(ctx) {
    const config = resolveDiscordConfigForTarget(ctx.config)
    if (!isConfigured(config)) return
    await sendAlert(config, ctx.event)
  },
}

export default discordNotifier
