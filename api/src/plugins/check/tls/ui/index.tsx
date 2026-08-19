import type { PluginUiModule } from '@umpire/plugin-ui'
import TlsCheckPage, { TlsCheckWidget } from './Page'

const tlsCheckUi: PluginUiModule = {
  id: 'tls',
  kind: 'check',
  path: '/plugins/check/tls',
  label: 'TLS check',
  Component: TlsCheckPage,
  Dashboard: TlsCheckWidget,
}

export default tlsCheckUi
