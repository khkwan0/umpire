import type { AlertEvent, NotifierPlugin } from '../../types.js'
import { isConfigured, readConfig } from './config.js'
import { registerTelegramRoutes } from './routes.js'
import { sendAlert } from './send.js'

const telegramNotifier: NotifierPlugin = {
  id: 'telegram',
  init(): void {
    const config = readConfig()
    if (isConfigured(config)) console.log('[notify:telegram] initialized')
    else console.warn('[notify:telegram] missing botToken/chatId; set /api/plugins/notify/telegram/config')
  },
  isReady(): boolean {
    return isConfigured(readConfig())
  },
  async registerRoutes(app) {
    await registerTelegramRoutes(app)
  },
  async notify(event: AlertEvent): Promise<void> {
    const config = readConfig()
    if (!isConfigured(config)) return
    await sendAlert(config, event)
  },
}

export default telegramNotifier
