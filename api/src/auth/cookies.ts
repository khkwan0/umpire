import {createHash, randomBytes} from 'node:crypto'
import type {FastifyReply, FastifyRequest} from 'fastify'

export const SESSION_COOKIE = 'umpire_session'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function parseCookies(
  header: string | undefined,
): Record<string, string> {
  if (!header) return {}
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (!key) continue
    try {
      out[key] = decodeURIComponent(value)
    } catch {
      out[key] = value
    }
  }
  return out
}

export function getSessionToken(req: FastifyRequest): string | undefined {
  const cookies = parseCookies(req.headers.cookie)
  const token = cookies[SESSION_COOKIE]
  return token || undefined
}

function cookieSecure(req: FastifyRequest): boolean {
  if (req.protocol === 'https') return true
  const forwarded = req.headers['x-forwarded-proto']
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() === 'https'
  }
  return false
}

export function setSessionCookie(
  req: FastifyRequest,
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
): void {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
  ]
  if (cookieSecure(req)) parts.push('Secure')
  reply.header('Set-Cookie', parts.join('; '))
}

export function clearSessionCookie(
  req: FastifyRequest,
  reply: FastifyReply,
): void {
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (cookieSecure(req)) parts.push('Secure')
  reply.header('Set-Cookie', parts.join('; '))
}
