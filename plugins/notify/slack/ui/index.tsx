import type { PluginUiModule } from '@umpire/plugin-ui'
import SlackPage, { SlackWidget } from './SlackPage'

const slackUi: PluginUiModule = {
  id: 'slack',
  kind: 'notify',
  path: '/plugins/notify/slack',
  label: 'Slack',
  Component: SlackPage,
  Dashboard: SlackWidget,
}

export default slackUi
