import type {FastifyInstance, FastifyReply, FastifyRequest} from 'fastify'
import {getCore} from '../core/index.js'
import type {AuthPrincipal} from '../plugins/types.js'
import {getBearerToken} from './tokens.js'
import {getSessionToken} from './cookies.js'
import {
  isAdminOnlyPath,
  isDeviceRegistrationPath,
  isReadMethod,
  isSelfServiceAuthPath,
  parsePluginPath,
  pluginAllowed,
} from './permissions.js'

export type AuthRequest = FastifyRequest & {
  auth?: AuthPrincipal
}

const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/policy',
  '/api/auth/login',
  '/api/auth/logout',
])

const WS_DEFER_AUTH_PATHS = new Set(['/api/agent/ws', '/api/ws'])

function isWebSocketUpgrade(req: FastifyRequest): boolean {
  return req.headers.upgrade?.toLowerCase() === 'websocket'
}

function requestPath(url: string): string {
  const q = url.indexOf('?')
  return q >= 0 ? url.slice(0, q) : url
}

function deny(
  reply: FastifyReply,
  status: 401 | 403,
  error: string,
): FastifyReply {
  return reply.code(status).send({error})
}

/**
 * Resolve the effective principal for a request (Bearer token or session).
 * Does not enforce; used by the gate and GET /api/auth/me.
 */
export function resolvePrincipal(req: FastifyRequest): AuthPrincipal | null {
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

export function getAuthContext(req: FastifyRequest): AuthPrincipal | undefined {
  return (req as AuthRequest).auth
}

export async function registerAuthGate(app: FastifyInstance): Promise<void> {
  app.decorateRequest('auth', undefined)

  app.addHook('onRequest', async (req, reply) => {
    const path = requestPath(req.url)
    if (!path.startsWith('/api/')) return
    if (PUBLIC_PATHS.has(path)) return

    if (WS_DEFER_AUTH_PATHS.has(path) && isWebSocketUpgrade(req)) {
      const principal = resolvePrincipal(req)
      if (principal) {
        ;(req as AuthRequest).auth = principal
      }
      return
    }

    const method = req.method.toUpperCase()
    const read = isReadMethod(method)
    const bearer = getBearerToken(req)
    let principal: AuthPrincipal | null = null

    if (bearer) {
      principal = getCore().resolveApiTokenPrincipal(bearer)
      if (!principal) {
        return deny(reply, 401, 'Invalid or expired API token')
      }
    } else {
      const token = getSessionToken(req)
      if (token) {
        principal = getCore().resolveSessionPrincipal(token)
      }
    }

    if (!principal) {
      if (isDeviceRegistrationPath(method, path)) {
        principal = getCore().anonymousReadOnlyPrincipal()
      } else {
        return deny(reply, 401, 'Authentication required')
      }
    }

    ;(req as AuthRequest).auth = principal

    if (
      !read &&
      !principal.can_write &&
<<<<<<< HEAD
      !isDeviceRegistrationPath(method, path)
=======
      !isDeviceRegistrationPath(method, path) &&
      !isSelfServiceAuthPath(method, path)
>>>>>>> 7341e40 (initial auith)
    ) {
      return deny(reply, 403, 'Write access required')
    }

    if (isAdminOnlyPath(method, path) && !principal.is_admin) {
      return deny(reply, 403, 'Admin access required')
    }

    const plugin = parsePluginPath(path)
    if (plugin && !pluginAllowed(principal, plugin.kind, plugin.id)) {
      return deny(reply, 403, 'Plugin access denied')
    }
  })
}
