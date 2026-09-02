import type {AuthPluginUiModule} from '@umpire/plugin-ui'
import DisabledNotice from './DisabledNotice'
import RbacSettings from './RbacSettings'

const rbacUi: AuthPluginUiModule = {
  id: 'rbac',
  kind: 'auth',
  Settings: RbacSettings,
  DisabledNotice,
}

export default rbacUi
