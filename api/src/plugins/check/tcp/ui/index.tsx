import type { PluginUiModule } from '@umpire/plugin-ui'
import TcpCheckPage, { TcpCheckWidget } from './Page'

const tcpCheckUi: PluginUiModule = {
  id: 'tcp',
  kind: 'check',
  path: '/plugins/check/tcp',
  label: 'TCP check',
  Component: TcpCheckPage,
  Dashboard: TcpCheckWidget,
}

export default tcpCheckUi
