import type { PluginUiModule } from '@umpire/plugin-ui'
import WebhookPage, { WebhookWidget } from './WebhookPage'

const webhookUi: PluginUiModule = {
  id: 'webhook',
  kind: 'notify',
  path: '/plugins/notify/webhook',
  label: 'Webhook',
  Component: WebhookPage,
  Dashboard: WebhookWidget,
}

export default webhookUi
