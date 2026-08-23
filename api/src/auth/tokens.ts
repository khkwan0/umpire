import {createHash, randomBytes} from 'node:crypto'
import type {FastifyRequest} from 'fastify'

export const API_TOKEN_PREFIX = 'umpire_'

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newApiToken(): string {
  return `${API_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
}

export function apiTokenPrefix(token: string): string {
  return token.slice(0, Math.min(20, token.length))
}

export function isApiTokenFormat(token: string): boolean {
  return (
    token.startsWith(API_TOKEN_PREFIX) && token.length > API_TOKEN_PREFIX.length
  )
}

export function getBearerToken(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return undefined
  const token = header.slice('Bearer '.length).trim()
  return token || undefined
}
