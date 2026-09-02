import rbacUi from '../../plugins/auth/rbac/mobile/index'
import {isAuthPluginUiModule, type AuthPluginUiModule} from './plugin-ui'

export type {AuthPluginUiModule, AuthPluginSettingsProps} from './plugin-ui'
export {isAuthPluginUiModule}

export const authUiModules: AuthPluginUiModule[] = [rbacUi].filter(
  isAuthPluginUiModule,
)

export function authUiForPlugin(
  pluginId: string | undefined,
): AuthPluginUiModule | undefined {
  if (!pluginId) return undefined
  return authUiModules.find(ui => ui.id === pluginId)
}
