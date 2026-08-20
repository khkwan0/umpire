import type {FastifyInstance} from 'fastify'
import {getCore} from '../../../core/index.js'
import {normalizeKeywordBodyConfig, resolveKeywordBodyConfig} from './config.js'

const configSchema = {
  type: 'object',
  required: ['keyword', 'caseSensitive'],
  properties: {
    keyword: {type: 'string', minLength: 1},
    caseSensitive: {type: 'boolean'},
  },
} as const

export async function registerKeywordBodyCheckRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    '/targets/:targetId/config',
    {
      schema: {
        tags: ['keyword-body-check'],
        summary: 'Get keyword/body check config for one target',
        params: {
          type: 'object',
          required: ['targetId'],
          properties: {targetId: {type: 'string'}},
        },
        response: {
          200: configSchema,
          400: {type: 'object', properties: {error: {type: 'string'}}},
          404: {type: 'object', properties: {error: {type: 'string'}}},
        },
      },
    },
    async (req, reply) => {
      const targetId = Number((req.params as {targetId: string}).targetId)
      if (!Number.isInteger(targetId) || targetId < 1) {
        return reply.code(400).send({error: 'invalid targetId'})
      }
      if (!getCore().getTarget(targetId)) {
        return reply.code(404).send({error: 'target not found'})
      }
      return resolveKeywordBodyConfig(
        getCore().getTargetCheckConfig(targetId, 'keyword-body'),
      )
    },
  )

  app.put<{
    Params: {targetId: string}
    Body: {keyword?: string; caseSensitive?: boolean}
  }>(
    '/targets/:targetId/config',
    {
      schema: {
        tags: ['keyword-body-check'],
        summary: 'Set keyword/body check config for one target',
        params: {
          type: 'object',
          required: ['targetId'],
          properties: {targetId: {type: 'string'}},
        },
        body: configSchema,
        response: {
          200: configSchema,
          400: {
            type: 'object',
            properties: {error: {type: 'string'}},
          },
          404: {
            type: 'object',
            properties: {error: {type: 'string'}},
          },
        },
      },
    },
    async (req, reply) => {
      const targetId = Number(req.params.targetId)
      if (!Number.isInteger(targetId) || targetId < 1) {
        return reply.code(400).send({error: 'invalid targetId'})
      }
      if (!getCore().getTarget(targetId)) {
        return reply.code(404).send({error: 'target not found'})
      }
      try {
        const config = normalizeKeywordBodyConfig(req.body)
        getCore().setTargetCheckConfig(targetId, 'keyword-body', config)
        return config
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
  )
}
