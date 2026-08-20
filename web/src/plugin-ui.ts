import type {ComponentType} from 'react'
import type {StatusResponse} from './api'

/** Props passed to an optional plugin panel on the core Dashboard. */
export interface DashboardWidgetProps {
  status: StatusResponse
}

/** Contract for optional React pages co-located with a plugin under `ui/`.
 * Pages inherit the host light/dark theme via shared classes in `styles.css`.
 */
export interface PluginUiModule {
  /** Must match the plugin id (e.g. "fcm"). */
  id: string
  kind: 'check' | 'scheduler' | 'notify'
  /** App route path (e.g. "/plugins/notify/fcm"). */
  path: string
  /**
   * UI label.
   * - `check` plugins render under the built-in "Checks" dropdown.
   * - `notify` plugins render under the built-in "Notifiers" dropdown.
   * - `scheduler` plugins render as top-level nav links.
   * Also used as the dashboard widget heading.
   */
  label: string
  Component: ComponentType
  /** Optional panel on the core Dashboard. Does not add a nav item. */
  Dashboard?: ComponentType<DashboardWidgetProps>
}

export type DashboardWidgetModule = PluginUiModule & {
  Dashboard: ComponentType<DashboardWidgetProps>
}

export function hasDashboardWidget(
  ui: PluginUiModule,
): ui is DashboardWidgetModule {
  return typeof ui.Dashboard === 'function'
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
