import type {FastifyRequest} from 'fastify'
import {getCore} from '../../../api/src/core/index.js'
import {
  getBearerToken,
  getSessionToken,
} from '../../../api/src/auth/index.js'
import {hashSessionToken} from '../../../api/src/auth/cookies.js'
import {hashApiToken} from '../../../api/src/auth/tokens.js'
import type {AuthPrincipal, GateDecision} from '../../../api/src/plugins/types.js'
import {
  isAdminOnlyPath,
  isDeviceRegistrationPath,
  isReadMethod,
  isSelfServiceAuthPath,
  parsePluginPath,
  pluginAllowed,
} from '../../../api/src/auth/permissions.js'

export const RBAC_PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/policy',
  '/api/auth/login',
  '/api/auth/logout',
])

export function rbacPublicPaths(): Set<string> {
  return RBAC_PUBLIC_PATHS
}

export function rbacResolvePrincipal(req: FastifyRequest): AuthPrincipal | null {
  const store = getCore()

  const bearer = getBearerToken(req)
  if (bearer) {
    return store.resolveApiTokenPrincipal(bearer)
  }

  const token = getSessionToken(req)
  if (token) {
    return store.resolveSessionPrincipal(token)
  }

  return null
}

export function rbacEvaluateAccess(
  req: FastifyRequest,
  principal: AuthPrincipal,
): GateDecision {
  const method = req.method.toUpperCase()
  const path = requestPath(req.url)
  const read = isReadMethod(method)

  if (
    !read &&
    !principal.can_write &&
    !isDeviceRegistrationPath(method, path) &&
    !isSelfServiceAuthPath(method, path)
  ) {
    return {ok: false, status: 403, error: 'Write access required'}
  }

  if (isAdminOnlyPath(method, path) && !principal.is_admin) {
    return {ok: false, status: 403, error: 'Admin access required'}
  }

  const plugin = parsePluginPath(path)
  if (plugin && !pluginAllowed(principal, plugin.kind, plugin.id)) {
    return {ok: false, status: 403, error: 'Plugin access denied'}
  }

  return {ok: true}
}

export function rbacResolvePrincipalOrAnonymous(
  req: FastifyRequest,
): AuthPrincipal | null {
  const principal = rbacResolvePrincipal(req)
  if (principal) return principal

  const store = getCore()
  const method = req.method.toUpperCase()
  const path = requestPath(req.url)

  if (isDeviceRegistrationPath(method, path)) {
    return store.anonymousReadOnlyPrincipal()
  }

  if (
    store.getAllowReadonlyWithoutAuth() &&
    isReadMethod(method)
  ) {
    return store.anonymousReadOnlyPrincipal()
  }

  return null
}

function requestPath(url: string): string {
  const q = url.indexOf('?')
  return q >= 0 ? url.slice(0, q) : url
}
