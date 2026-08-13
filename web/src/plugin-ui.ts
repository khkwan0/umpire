import type { ComponentType } from 'react'

/** Contract for optional React pages co-located with a plugin under `ui/`. */
export interface PluginUiModule {
  /** Must match the plugin id (e.g. "fcm"). */
  id: string
  kind: 'check' | 'scheduler' | 'notify'
  /** App route path (e.g. "/plugins/notify/fcm"). */
  path: string
  /** Nav label. */
  label: string
  Component: ComponentType
}

export function isPluginUiModule(value: unknown): value is PluginUiModule {
  if (!value || typeof value !== 'object') return false
  const m = value as Record<string, unknown>
  return (
    typeof m.id === 'string' &&
    (m.kind === 'check' || m.kind === 'scheduler' || m.kind === 'notify') &&
    typeof m.path === 'string' &&
    typeof m.label === 'string' &&
    typeof m.Component === 'function'
  )
}
