import {getAuth} from '../plugins/runtime.js'
import {isAuthPluginActive} from './policy.js'

/** No-op kept for call sites; auth active state is read at runtime from plugin manager. */
export function initAuthActiveState(): void {
  const plugin = getAuth()
  if (plugin && isAuthPluginActive()) {
    console.log(`[auth] plugin=${plugin.id} enabled`)
  } else if (plugin) {
    console.log(`[auth] plugin=${plugin.id} disabled (open mode)`)
  } else {
    console.log('[auth] no auth plugin loaded (open mode)')
  }
}

export {isAuthPluginActive} from './policy.js'
