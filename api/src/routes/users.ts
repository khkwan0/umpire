import type {FastifyInstance} from 'fastify'
import {getCore} from '../core/index.js'

const errorResponse = {
  type: 'object',
  properties: {error: {type: 'string'}},
} as const

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/users',
    {
      schema: {
        tags: ['users'],
        summary: 'List users',
        response: {
          200: {type: 'array', items: {$ref: 'User#'}},
        },
      },
    },
    async () => getCore().listUsers(),
  )

  app.get<{Params: {id: string}}>(
    '/api/users/:id',
    {
      schema: {
        tags: ['users'],
        summary: 'Get a user',
        params: {
          type: 'object',
          required: ['id'],
          properties: {id: {type: 'string'}},
        },
        response: {
          200: {$ref: 'User#'},
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      const user = getCore().getUser(id)
      if (!user) return reply.code(404).send({error: 'User not found'})
      return user
    },
  )

  app.post<{
    Body: {username?: string; password?: string; role_id?: number}
  }>(
    '/api/users',
    {
      schema: {
        tags: ['users'],
        summary: 'Create a user',
        body: {
          type: 'object',
          required: ['username', 'password', 'role_id'],
          properties: {
            username: {type: 'string'},
            password: {type: 'string'},
            role_id: {type: 'integer'},
          },
        },
        response: {
          200: {$ref: 'User#'},
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return getCore().createUser({
          username: req.body.username ?? '',
          password: req.body.password ?? '',
          role_id: Number(req.body.role_id),
        })
      } catch (err) {
        return reply
          .code(400)
          .send({error: err instanceof Error ? err.message : String(err)})
      }
    },
  )

  app.put<{
    Params: {id: string}
    Body: {username?: string; password?: string; role_id?: number}
  }>(
    '/api/users/:id',
    {
      schema: {
        tags: ['users'],
        summary: 'Update a user',
        params: {
          type: 'object',
          required: ['id'],
          properties: {id: {type: 'string'}},
        },
        body: {
          type: 'object',
          properties: {
            username: {type: 'string'},
            password: {type: 'string'},
            role_id: {type: 'integer'},
          },
        },
        response: {
          200: {$ref: 'User#'},
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      try {
        const user = getCore().updateUser(id, {
          username: req.body.username,
          password: req.body.password,
          role_id: req.body.role_id,
        })
        if (!user) return reply.code(404).send({error: 'User not found'})
        return user
      } catch (err) {
        return reply
          .code(400)
          .send({error: err instanceof Error ? err.message : String(err)})
      }
    },
  )

  app.delete<{Params: {id: string}}>(
    '/api/users/:id',
    {
      schema: {
        tags: ['users'],
        summary: 'Delete a user',
        params: {
          type: 'object',
          required: ['id'],
          properties: {id: {type: 'string'}},
        },
        response: {
          204: {type: 'null'},
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      try {
        const ok = getCore().deleteUser(id)
        if (!ok) return reply.code(404).send({error: 'User not found'})
        return reply.code(204).send()
      } catch (err) {
        return reply
          .code(400)
          .send({error: err instanceof Error ? err.message : String(err)})
      }
    },
  )
}
