import type {FastifyReply, FastifyRequest} from 'fastify'
import {
  getAuthContext,
  resolvePrincipal,
  type AuthRequest,
} from '../auth/index.js'
import type {AuthPrincipal} from '../plugins/types.js'

export const CHAT_OWNER_HEADER = 'x-umpire-chat-owner'

export interface AgentChatOwner {
  userId: number | null
  ownerKey: string | null
}

export function ownerKeyFromFrame(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length >= 8 && trimmed.length <= 128 ? trimmed : null
}

function ownerKeyFromRequest(req: FastifyRequest): string | null {
  const raw = req.headers[CHAT_OWNER_HEADER]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length >= 8 && trimmed.length <= 128 ? trimmed : null
}

export function resolveAgentChatOwner(
  req: FastifyRequest,
  reply: FastifyReply,
): AgentChatOwner | null {
  const principal =
    getAuthContext(req) ?? resolvePrincipal(req) ?? (req as AuthRequest).auth
  if (!principal) {
    reply.code(401).send({error: 'Authentication required'})
    return null
  }
  if (!principal.can_write) {
    reply.code(403).send({error: 'Write access required'})
    return null
  }
  if (principal.user) {
    return {userId: principal.user.id, ownerKey: null}
  }
  const ownerKey = ownerKeyFromRequest(req)
  if (!ownerKey) {
    reply.code(400).send({
      error: `Missing or invalid ${CHAT_OWNER_HEADER} header`,
    })
    return null
  }
  return {userId: null, ownerKey}
}

export function agentChatOwnerFromPrincipal(
  principal: AuthPrincipal,
  ownerKey: string | null,
): AgentChatOwner | null {
  if (!principal.can_write) return null
  if (principal.user) return {userId: principal.user.id, ownerKey: null}
  if (!ownerKey) return null
  return {userId: null, ownerKey}
}
