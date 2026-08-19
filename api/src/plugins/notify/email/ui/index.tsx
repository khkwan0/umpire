import type { PluginUiModule } from '@umpire/plugin-ui'
import EmailPage, { EmailWidget } from './EmailPage'

const emailUi: PluginUiModule = {
  id: 'email',
  kind: 'notify',
  path: '/plugins/notify/email',
  label: 'Email',
  Component: EmailPage,
  Dashboard: EmailWidget,
}

export default emailUi
