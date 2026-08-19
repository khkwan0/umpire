import type { AlertEvent, NotifierPlugin } from '../../types.js'
import { isConfigured, readConfig } from './config.js'
import { registerDiscordRoutes } from './routes.js'
import { sendAlert } from './send.js'

const discordNotifier: NotifierPlugin = {
  id: 'discord',
  init(): void {
    const config = readConfig()
    if (isConfigured(config)) console.log('[notify:discord] initialized')
    else console.warn('[notify:discord] no webhookUrl configured; set /api/plugins/notify/discord/config')
  },
  isReady(): boolean {
    return isConfigured(readConfig())
  },
  async registerRoutes(app) {
    await registerDiscordRoutes(app)
  },
  async notify(event: AlertEvent): Promise<void> {
    const config = readConfig()
    if (!isConfigured(config)) return
    await sendAlert(config, event)
  },
}

export default discordNotifier
