import type { PluginUiModule } from '@umpire/plugin-ui'
import KeywordBodyCheckPage, { KeywordBodyCheckWidget } from './Page'

const keywordBodyCheckUi: PluginUiModule = {
  id: 'keyword-body',
  kind: 'check',
  path: '/plugins/check/keyword-body',
  label: 'Keyword/body check',
  Component: KeywordBodyCheckPage,
  Dashboard: KeywordBodyCheckWidget,
}

export default keywordBodyCheckUi
