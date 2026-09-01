import type {AuthPrincipal} from '../plugins/types.js'

/** Pure permission helpers mirrored from the Fastify gate (for unit tests). */

export function isReadMethod(method: string): boolean {
  const m = method.toUpperCase()
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS'
}

/** Mobile apps register their own FCM token without admin/write access. */
export function isDeviceRegistrationPath(method: string, path: string): boolean {
  return (
    method.toUpperCase() === 'POST' &&
    path === '/api/plugins/notify/fcm/tokens/register'
  )
}

export function isAdminOnlyPath(method: string, path: string): boolean {
  if (path === '/api/users' || path.startsWith('/api/users/')) return true
  if (path === '/api/roles' || path.startsWith('/api/roles/')) return true
  if (
    (path === '/api/plugin-manager' ||
      path.startsWith('/api/plugin-manager/')) &&
    !isReadMethod(method)
  ) {
    return true
  }
  if (path === '/api/settings' && !isReadMethod(method)) return true
  if (path === '/api/agent/settings') return true
  return false
}

export function parsePluginPath(
  path: string,
): {kind: 'check' | 'notify' | 'scheduler'; id: string} | null {
  const match = path.match(
    /^\/api\/plugins\/(check|notify|scheduler)\/([^/]+)(?:\/|$)/,
  )
  if (!match) return null
  return {
    kind: match[1] as 'check' | 'notify' | 'scheduler',
    id: match[2]!,
  }
}

export function pluginAllowed(
  principal: AuthPrincipal,
  kind: 'check' | 'notify' | 'scheduler',
  id: string,
): boolean {
  if (principal.plugins === 'all') return true
  return principal.plugins.some(p => p.kind === kind && p.id === id)
}

export type GateDecision =
  {ok: true} | {ok: false; status: 401 | 403; error: string}

export function evaluateGate(input: {
  authEnabled: boolean
  allowReadonlyWithoutAuth: boolean
  method: string
  path: string
  principal: AuthPrincipal | null
}): GateDecision {
  const {authEnabled, allowReadonlyWithoutAuth, method, path, principal} = input
  if (!path.startsWith('/api/')) return {ok: true}
  if (
    path === '/api/health' ||
    path === '/api/auth/policy' ||
    path === '/api/auth/login' ||
    path === '/api/auth/logout'
  ) {
    return {ok: true}
  }
  if (!authEnabled) return {ok: true}

  const read = isReadMethod(method)
  let effective = principal
  if (!effective) {
    if (read && allowReadonlyWithoutAuth) {
      effective = {
        kind: 'anonymous',
        user: null,
        is_admin: false,
        can_write: false,
        plugins: 'all',
        single_user_mode: false,
      }
    } else {
      return {ok: false, status: 401, error: 'Authentication required'}
    }
  }

  if (!read && !effective.can_write && !isDeviceRegistrationPath(method, path)) {
    return {ok: false, status: 403, error: 'Write access required'}
  }
  if (isAdminOnlyPath(method, path) && !effective.is_admin) {
    return {ok: false, status: 403, error: 'Admin access required'}
  }
  const plugin = parsePluginPath(path)
  if (plugin && !pluginAllowed(effective, plugin.kind, plugin.id)) {
    return {ok: false, status: 403, error: 'Plugin access denied'}
  }
  return {ok: true}
}
