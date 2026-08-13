import type { PluginUiModule } from '@umpire/plugin-ui'
import TokensPage from './TokensPage'

const fcmUi: PluginUiModule = {
  id: 'fcm',
  kind: 'notify',
  path: '/plugins/notify/fcm',
  label: 'FCM tokens',
  Component: TokensPage,
}

export default fcmUi
