import type {FastifyInstance, FastifyReply, FastifyRequest} from 'fastify'
import {
  apiTokenPrefix,
  getAuthContext,
  hashApiToken,
  newApiToken,
  resolvePrincipal,
} from '../auth/index.js'
import {getCore} from '../core/index.js'
import type {AuthPrincipal} from '../plugins/types.js'

const errorResponse = {
  type: 'object',
  properties: {error: {type: 'string'}},
} as const

function expiresSqlite(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function requireUserAccount(
  req: FastifyRequest,
  reply: FastifyReply,
): AuthPrincipal | null {
  const principal = getAuthContext(req) ?? resolvePrincipal(req)
  if (!principal?.user) {
    reply.code(401).send({error: 'User account required'})
    return null
  }
  return principal
}

export async function tokensRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/tokens',
    {
      schema: {
        tags: ['api-tokens'],
        summary: 'List API tokens (own tokens; admin sees all)',
        response: {
          200: {type: 'array', items: {$ref: 'ApiToken#'}},
          401: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const principal = requireUserAccount(req, reply)
      if (!principal) return
      const store = getCore()
      if (principal.is_admin) return store.listApiTokens()
      return store.listApiTokens(principal.user!.id)
    },
  )

  app.post<{Body: {label?: string; expires_in_days?: number | null}}>(
    '/api/tokens',
    {
      schema: {
        tags: ['api-tokens'],
        summary: 'Create an API token for the current user (secret shown once)',
        body: {
          type: 'object',
          properties: {
            label: {type: 'string'},
            expires_in_days: {
              type: ['integer', 'null'],
              minimum: 1,
              maximum: 3650,
            },
          },
        },
        response: {
          200: {$ref: 'ApiTokenCreated#'},
          400: errorResponse,
          401: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const principal = requireUserAccount(req, reply)
      if (!principal) return

      const label =
        typeof req.body?.label === 'string' ? req.body.label.trim() : ''
      const expiresInDays = req.body?.expires_in_days
      let expiresAt: string | null = null
      if (expiresInDays != null) {
        const days = Number(expiresInDays)
        if (!Number.isFinite(days) || days < 1) {
          return reply.code(400).send({error: 'expires_in_days must be >= 1'})
        }
        expiresAt = expiresSqlite(
          new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        )
      }

      const raw = newApiToken()
      const created = getCore().createApiToken({
        userId: principal.user!.id,
        label: label || 'Agent token',
        tokenHash: hashApiToken(raw),
        tokenPrefix: apiTokenPrefix(raw),
        expiresAt,
      })
      return {token: raw, api_token: created}
    },
  )

  app.delete<{Params: {id: string}}>(
    '/api/tokens/:id',
    {
      schema: {
        tags: ['api-tokens'],
        summary: 'Revoke an API token (own token, or any token when admin)',
        params: {
          type: 'object',
          required: ['id'],
          properties: {id: {type: 'string'}},
        },
        response: {
          200: {
            type: 'object',
            required: ['ok'],
            properties: {ok: {type: 'boolean'}},
          },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const principal = requireUserAccount(req, reply)
      if (!principal) return

      const id = Number(req.params.id)
      const store = getCore()
      const existing = store.getApiToken(id)
      if (!existing) {
        return reply.code(404).send({error: 'Token not found'})
      }
      if (!principal.is_admin && existing.user_id !== principal.user!.id) {
        return reply.code(403).send({error: 'Forbidden'})
      }
      store.deleteApiToken(id)
      return {ok: true}
    },
  )
}
