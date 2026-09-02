import {getAuth} from '../plugins/runtime.js'
import {isPluginEnabled} from '../plugins/manager.js'

let authActiveAtStartup = false

/** Snapshot auth plugin enablement at startup (toggle requires restart). */
export function initAuthActiveState(): void {
  const plugin = getAuth()
  authActiveAtStartup =
    plugin !== undefined && isPluginEnabled('auth', plugin.id)
}

export function isAuthPluginActive(): boolean {
  return authActiveAtStartup
}
