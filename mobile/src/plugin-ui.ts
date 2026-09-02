import type {ComponentType} from 'react'
import type {PluginManagerState} from '@/lib/api'

/** Props for auth plugin panels embedded on core Settings. */
export interface AuthPluginSettingsProps {
  pluginManager: PluginManagerState | null
}

/** Contract for auth plugin UI under `plugins/auth/<id>/mobile/`. */
export interface AuthPluginUiModule {
  id: string
  kind: 'auth'
  Settings: ComponentType<AuthPluginSettingsProps>
  DisabledNotice: ComponentType
}

export function isAuthPluginUiModule(value: unknown): value is AuthPluginUiModule {
  if (!value || typeof value !== 'object') return false
  const m = value as Record<string, unknown>
  return (
    typeof m.id === 'string' &&
    m.kind === 'auth' &&
    typeof m.Settings === 'function' &&
    typeof m.DisabledNotice === 'function'
  )
}
