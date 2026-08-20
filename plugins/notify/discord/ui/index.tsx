import type { PluginUiModule } from '@umpire/plugin-ui'
import DiscordPage, { DiscordWidget } from './DiscordPage'

const discordUi: PluginUiModule = {
  id: 'discord',
  kind: 'notify',
  path: '/plugins/notify/discord',
  label: 'Discord',
  Component: DiscordPage,
  Dashboard: DiscordWidget,
}

export default discordUi
