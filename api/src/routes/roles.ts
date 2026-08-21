import type {FastifyInstance} from 'fastify'
import {getCore} from '../core/index.js'
import type {RolePluginRef} from '../plugins/types.js'

const errorResponse = {
  type: 'object',
  properties: {error: {type: 'string'}},
} as const

const pluginRefBody = {
  type: 'object',
  required: ['kind', 'id'],
  properties: {
    kind: {type: 'string', enum: ['check', 'notify', 'scheduler']},
    id: {type: 'string'},
  },
} as const

export async function rolesRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/roles',
    {
      schema: {
        tags: ['roles'],
        summary: 'List roles',
        response: {
          200: {type: 'array', items: {$ref: 'Role#'}},
        },
      },
    },
    async () => getCore().listRoles(),
  )

  app.get<{Params: {id: string}}>(
    '/api/roles/:id',
    {
      schema: {
        tags: ['roles'],
        summary: 'Get a role',
        params: {
          type: 'object',
          required: ['id'],
          properties: {id: {type: 'string'}},
        },
        response: {
          200: {$ref: 'Role#'},
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      const role = getCore().getRole(id)
      if (!role) return reply.code(404).send({error: 'Role not found'})
      return role
    },
  )

  app.post<{
    Body: {name?: string; can_write?: boolean; plugins?: RolePluginRef[]}
  }>(
    '/api/roles',
    {
      schema: {
        tags: ['roles'],
        summary: 'Create a custom role',
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: {type: 'string'},
            can_write: {type: 'boolean'},
            plugins: {type: 'array', items: pluginRefBody},
          },
        },
        response: {
          200: {$ref: 'Role#'},
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return getCore().createRole({
          name: req.body.name ?? '',
          can_write: Boolean(req.body.can_write),
          plugins: req.body.plugins ?? [],
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
    Body: {name?: string; can_write?: boolean; plugins?: RolePluginRef[]}
  }>(
    '/api/roles/:id',
    {
      schema: {
        tags: ['roles'],
        summary: 'Update a custom role',
        params: {
          type: 'object',
          required: ['id'],
          properties: {id: {type: 'string'}},
        },
        body: {
          type: 'object',
          properties: {
            name: {type: 'string'},
            can_write: {type: 'boolean'},
            plugins: {type: 'array', items: pluginRefBody},
          },
        },
        response: {
          200: {$ref: 'Role#'},
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      try {
        const role = getCore().updateRole(id, {
          name: req.body.name,
          can_write: req.body.can_write,
          plugins: req.body.plugins,
        })
        if (!role) return reply.code(404).send({error: 'Role not found'})
        return role
      } catch (err) {
        return reply
          .code(400)
          .send({error: err instanceof Error ? err.message : String(err)})
      }
    },
  )

  app.delete<{Params: {id: string}}>(
    '/api/roles/:id',
    {
      schema: {
        tags: ['roles'],
        summary: 'Delete a custom role',
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
        const ok = getCore().deleteRole(id)
        if (!ok) return reply.code(404).send({error: 'Role not found'})
        return reply.code(204).send()
      } catch (err) {
        return reply
          .code(400)
          .send({error: err instanceof Error ? err.message : String(err)})
      }
    },
  )
}
