import type { PluginUiModule } from '@umpire/plugin-ui'
import TelegramPage, { TelegramWidget } from './TelegramPage'

const telegramUi: PluginUiModule = {
  id: 'telegram',
  kind: 'notify',
  path: '/plugins/notify/telegram',
  label: 'Telegram',
  Component: TelegramPage,
  Dashboard: TelegramWidget,
}

export default telegramUi
