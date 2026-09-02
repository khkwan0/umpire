import {
  isAuthPluginUiModule,
  type AuthPluginUiModule,
} from './plugin-ui'

export type {AuthPluginUiModule, AuthPluginSettingsProps} from './plugin-ui'
export {isAuthPluginUiModule}

export const authUiModules: AuthPluginUiModule[] = Object.values(
  import.meta.glob('../../plugins/auth/*/ui/index.tsx', {
    eager: true,
  }),
)
  .map(mod => {
    const m = mod as {default?: unknown}
    return m.default
  })
  .filter(isAuthPluginUiModule)

export function authUiForPlugin(
  pluginId: string | undefined,
): AuthPluginUiModule | undefined {
  if (!pluginId) return undefined
  return authUiModules.find(ui => ui.id === pluginId)
}
