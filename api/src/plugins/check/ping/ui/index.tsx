import type { PluginUiModule } from '@umpire/plugin-ui'
import PingCheckPage, { PingCheckWidget } from './Page'

const pingCheckUi: PluginUiModule = {
  id: 'ping',
  kind: 'check',
  path: '/plugins/check/ping',
  label: 'Ping check',
  Component: PingCheckPage,
  Dashboard: PingCheckWidget,
}

export default pingCheckUi
