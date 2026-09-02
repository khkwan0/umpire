import type {FastifyInstance} from 'fastify'
import {
  clearSessionCookie,
  getAuthContext,
  getSessionToken,
  hashSessionToken,
  newSessionToken,
  resolvePrincipal,
  SESSION_TTL_MS,
  setSessionCookie,
  verifyPassword,
} from '../auth/index.js'
import {getCore} from '../core/index.js'

const errorResponse = {
  type: 'object',
  properties: {error: {type: 'string'}},
} as const

function expiresSqlite(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/auth/policy',
    {
      schema: {
        tags: ['auth'],
        summary: 'Public auth policy for UI gating',
        response: {
          200: {
            type: 'object',
            required: ['login_required', 'user_count'],
            properties: {
              login_required: {type: 'boolean'},
              user_count: {type: 'integer'},
            },
          },
        },
      },
    },
    async () => {
      const store = getCore()
      return {
        login_required: true,
        user_count: store.countUsers(),
      }
    },
  )

  app.post<{Body: {username?: string; password?: string}}>(
    '/api/auth/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Log in and set session cookie',
        body: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: {type: 'string'},
            password: {type: 'string'},
          },
        },
        response: {
          200: {$ref: 'AuthMe#'},
          400: errorResponse,
          401: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const username =
        typeof req.body?.username === 'string' ? req.body.username.trim() : ''
      const password =
        typeof req.body?.password === 'string' ? req.body.password : ''
      if (!username || !password) {
        return reply.code(400).send({error: 'username and password required'})
      }
      const store = getCore()
      const user = store.getUserByUsername(username)
      if (!user) {
        return reply.code(401).send({error: 'Invalid username or password'})
      }
      const hash = store.getUserPasswordHash(user.id)
      if (!hash || !verifyPassword(password, hash)) {
        return reply.code(401).send({error: 'Invalid username or password'})
      }
      const token = newSessionToken()
      const expires = new Date(Date.now() + SESSION_TTL_MS)
      store.createSession(
        user.id,
        hashSessionToken(token),
        expiresSqlite(expires),
      )
      setSessionCookie(req, reply, token, expires)
      const principal = store.principalForUser(user.id)!
      return {principal}
    },
  )

  app.post(
    '/api/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Clear session cookie',
        response: {
          200: {
            type: 'object',
            required: ['ok'],
            properties: {ok: {type: 'boolean'}},
          },
        },
      },
    },
    async (req, reply) => {
      const token = getSessionToken(req)
      if (token) {
        getCore().deleteSessionByTokenHash(hashSessionToken(token))
      }
      clearSessionCookie(req, reply)
      return {ok: true}
    },
  )

  app.post<{
    Body: {current_password?: string; new_password?: string}
  }>(
    '/api/auth/change-password',
    {
      schema: {
        tags: ['auth'],
        summary: 'Change password for the signed-in user',
        body: {
          type: 'object',
          required: ['current_password', 'new_password'],
          properties: {
            current_password: {type: 'string'},
            new_password: {type: 'string'},
          },
        },
        response: {
          200: {$ref: 'AuthMe#'},
          400: errorResponse,
          401: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const principal = getAuthContext(req)
      if (!principal?.user) {
        return reply.code(401).send({error: 'Authentication required'})
      }
      const currentPassword =
        typeof req.body?.current_password === 'string'
          ? req.body.current_password
          : ''
      const newPassword =
        typeof req.body?.new_password === 'string' ? req.body.new_password : ''
      if (!currentPassword || !newPassword) {
        return reply
          .code(400)
          .send({error: 'current_password and new_password required'})
      }
      const store = getCore()
      const hash = store.getUserPasswordHash(principal.user.id)
      if (!hash || !verifyPassword(currentPassword, hash)) {
        return reply.code(401).send({error: 'Current password is incorrect'})
      }
      try {
        store.updateUser(principal.user.id, {password: newPassword})
      } catch (err) {
        return reply
          .code(400)
          .send({error: err instanceof Error ? err.message : String(err)})
      }
      const token = newSessionToken()
      const expires = new Date(Date.now() + SESSION_TTL_MS)
      store.createSession(
        principal.user.id,
        hashSessionToken(token),
        expiresSqlite(expires),
      )
      setSessionCookie(req, reply, token, expires)
      const nextPrincipal = store.principalForUser(principal.user.id)!
      return {principal: nextPrincipal}
    },
  )

  app.get(
    '/api/auth/me',
    {
      schema: {
        tags: ['auth'],
        summary: 'Current auth principal',
        response: {
          200: {$ref: 'AuthMe#'},
          401: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const principal = getAuthContext(req) ?? resolvePrincipal(req)
      if (!principal) {
        return reply.code(401).send({error: 'Authentication required'})
      }
      return {principal}
    },
  )
}
