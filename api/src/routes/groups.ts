import type { FastifyInstance } from 'fastify'
import { getCore } from '../core/index.js'

const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const

export async function groupsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { tree?: string } }>(
    '/api/groups',
    {
      schema: {
        tags: ['groups'],
        summary: 'List groups',
        description:
          'Flat list by default. Pass tree=1 (or true/yes) for nested trees.',
        querystring: {
          type: 'object',
          properties: {
            tree: {
              type: 'string',
              description: 'Set to 1, true, or yes for nested tree response',
            },
          },
        },
        response: {
          200: {
            oneOf: [
              { type: 'array', items: { $ref: 'Group#' } },
              { type: 'array', items: { $ref: 'GroupTreeNode#' } },
            ],
          },
        },
      },
    },
    async (req) => {
      const tree =
        req.query.tree === '1' ||
        req.query.tree === 'true' ||
        req.query.tree === 'yes'
      return tree ? getCore().listGroupTree() : getCore().listGroups()
    },
  )

  app.get<{ Params: { id: string } }>(
    '/api/groups/:id',
    {
      schema: {
        tags: ['groups'],
        summary: 'Get group by id',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: {
          200: { $ref: 'Group#' },
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      if (!Number.isInteger(id) || id < 1) {
        return reply.code(400).send({ error: 'invalid id' })
      }
      const group = getCore().getGroup(id)
      if (!group) return reply.code(404).send({ error: 'not found' })
      return group
    },
  )

  app.post<{
    Body: { parent?: number; name?: string; tag?: string }
  }>(
    '/api/groups',
    {
      schema: {
        tags: ['groups'],
        summary: 'Create group',
        description:
          'parent=0 creates a new root tree. Tag defaults to group_N / group_group_1_group_2_…',
        body: {
          type: 'object',
          properties: {
            parent: { type: 'integer', minimum: 0, default: 0 },
            name: { type: 'string' },
            tag: {
              type: 'string',
              description: 'Optional override; otherwise auto-generated',
            },
          },
        },
        response: {
          201: { $ref: 'Group#' },
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const parent = req.body?.parent ?? 0
      if (!Number.isInteger(parent) || parent < 0) {
        return reply.code(400).send({ error: 'parent must be 0 or a group id' })
      }
      try {
        const group = getCore().createGroup({
          parent,
          name: req.body?.name,
          tag: req.body?.tag,
        })
        return reply.code(201).send(group)
      } catch (err) {
        return reply
          .code(400)
          .send({ error: err instanceof Error ? err.message : String(err) })
      }
    },
  )

  app.patch<{
    Params: { id: string }
    Body: { parent?: number; name?: string; tag?: string }
  }>(
    '/api/groups/:id',
    {
      schema: {
        tags: ['groups'],
        summary: 'Update group',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            parent: { type: 'integer', minimum: 0 },
            name: { type: 'string' },
            tag: { type: 'string' },
          },
        },
        response: {
          200: { $ref: 'Group#' },
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      if (!Number.isInteger(id) || id < 1) {
        return reply.code(400).send({ error: 'invalid id' })
      }
      if (
        req.body?.parent !== undefined &&
        (!Number.isInteger(req.body.parent) || req.body.parent < 0)
      ) {
        return reply.code(400).send({ error: 'parent must be 0 or a group id' })
      }
      try {
        const updated = getCore().updateGroup(id, req.body ?? {})
        if (!updated) return reply.code(404).send({ error: 'not found' })
        return updated
      } catch (err) {
        return reply
          .code(400)
          .send({ error: err instanceof Error ? err.message : String(err) })
      }
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/api/groups/:id',
    {
      schema: {
        tags: ['groups'],
        summary: 'Delete group and subtree',
        description:
          'Deletes descendants; clears group_id on affected targets.',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: {
          204: { type: 'null', description: 'Deleted' },
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      if (!Number.isInteger(id) || id < 1) {
        return reply.code(400).send({ error: 'invalid id' })
      }
      const ok = getCore().deleteGroup(id)
      if (!ok) return reply.code(404).send({ error: 'not found' })
      return reply.code(204).send()
    },
  )
}
