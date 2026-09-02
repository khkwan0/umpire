import type {FastifyInstance, FastifyReply, FastifyRequest} from 'fastify'
import {getAuth} from '../plugins/runtime.js'
import type {AuthPrincipal, GateDecision} from '../plugins/types.js'
import {isAuthPluginActive} from './active.js'
import {anonymousAdminPrincipal} from './principals.js'
import {getBearerToken} from './tokens.js'

export type AuthRequest = FastifyRequest & {
  auth?: AuthPrincipal
}

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

export function getAuthContext(req: FastifyRequest): AuthPrincipal | undefined {
  return (req as AuthRequest).auth
}

/** Resolve principal for /api/auth/me when auth plugin is active. */
export function resolvePrincipal(req: FastifyRequest): AuthPrincipal | null {
  const plugin = getAuth()
  if (!plugin || !isAuthPluginActive()) {
    return anonymousAdminPrincipal()
  }
  return plugin.resolvePrincipal(req)
}

function applyDecision(
  reply: FastifyReply,
  decision: GateDecision,
): FastifyReply | undefined {
  if (!decision.ok) {
    return deny(reply, decision.status, decision.error)
  }
  return undefined
}

export async function registerAuthGate(app: FastifyInstance): Promise<void> {
  app.decorateRequest('auth', undefined)

  app.addHook('onRequest', async (req, reply) => {
    const path = requestPath(req.url)
    if (!path.startsWith('/api/')) return

    const plugin = getAuth()
    const authActive = isAuthPluginActive()

    if (!authActive) {
      if (path === '/api/auth/policy') return
      ;(req as AuthRequest).auth = anonymousAdminPrincipal()
      return
    }

    if (plugin?.publicPaths().has(path)) return

    if (WS_DEFER_AUTH_PATHS.has(path) && isWebSocketUpgrade(req)) {
      const principal = plugin!.resolvePrincipal(req)
      if (principal) {
        ;(req as AuthRequest).auth = principal
      }
      return
    }

    const bearer = getBearerToken(req)
    if (bearer) {
      const tokenPrincipal = plugin!.resolvePrincipal(req)
      if (!tokenPrincipal) {
        return deny(reply, 401, 'Invalid or expired API token')
      }
      const denied = applyDecision(
        reply,
        plugin!.evaluateAccess(req, tokenPrincipal),
      )
      if (denied) return denied
      ;(req as AuthRequest).auth = tokenPrincipal
      return
    }

    const principal = plugin!.resolvePrincipal(req)
    if (!principal) {
      return deny(reply, 401, 'Authentication required')
    }

    const denied = applyDecision(reply, plugin!.evaluateAccess(req, principal))
    if (denied) return denied
    ;(req as AuthRequest).auth = principal
  })
}
