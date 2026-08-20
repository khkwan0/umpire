import type { PluginUiModule } from '@umpire/plugin-ui'
import HttpCheckPage, { HttpCheckWidget } from './HttpCheckPage'

const httpCheckUi: PluginUiModule = {
  id: 'http',
  kind: 'check',
  path: '/plugins/check/http',
  label: 'HTTP check',
  Component: HttpCheckPage,
  Dashboard: HttpCheckWidget,
}

export default httpCheckUi
