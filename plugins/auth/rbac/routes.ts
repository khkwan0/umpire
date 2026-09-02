import type {FastifyInstance} from 'fastify'
import {getAuthContext} from '../../../api/src/auth/index.js'
import {getCore} from '../../../api/src/core/index.js'
import {authRoutes} from '../../../api/src/routes/auth.js'
import {rolesRoutes} from '../../../api/src/routes/roles.js'
import {tokensRoutes} from '../../../api/src/routes/tokens.js'
import {usersRoutes} from '../../../api/src/routes/users.js'

const errorResponse = {
  type: 'object',
  properties: {error: {type: 'string'}},
} as const

export async function registerRbacRoutes(app: FastifyInstance): Promise<void> {
  await authRoutes(app)
  await usersRoutes(app)
  await rolesRoutes(app)
  await tokensRoutes(app)

  app.put<{Body: {allow_readonly_without_auth?: boolean}}>(
    '/api/plugins/auth/rbac/config',
    {
      schema: {
        tags: ['auth'],
        summary: 'Update RBAC auth plugin config (admin only)',
        body: {
          type: 'object',
          required: ['allow_readonly_without_auth'],
          properties: {
            allow_readonly_without_auth: {type: 'boolean'},
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['allow_readonly_without_auth'],
            properties: {
              allow_readonly_without_auth: {type: 'boolean'},
            },
          },
          400: errorResponse,
          403: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const principal = getAuthContext(req)
      if (!principal?.is_admin) {
        return reply.code(403).send({error: 'Admin access required'})
      }
      const value = req.body?.allow_readonly_without_auth
      if (typeof value !== 'boolean') {
        return reply
          .code(400)
          .send({error: 'allow_readonly_without_auth must be boolean'})
      }
      getCore().setAllowReadonlyWithoutAuth(value)
      return {allow_readonly_without_auth: value}
    },
  )
}
