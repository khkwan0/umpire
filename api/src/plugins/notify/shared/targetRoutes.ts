import type {FastifyInstance} from 'fastify'
import {getCore} from '../../../core/index.js'
import {
  extractNotifierCheckIds,
  hasNotifierTargetOverride,
  normalizeNotifierCheckIds,
  stripNotifierRoutingFields,
} from '../../../core/notifierRouting.js'
import {publishRealtime} from '../../../realtime.js'
import type {NotifierTargetConfigView} from './targetConfig.js'

const errorResponse = {
  type: 'object',
  properties: {error: {type: 'string'}},
} as const

const checkIdsSchema = {
  type: 'array',
  items: {type: 'string', minLength: 1},
  description:
    'Check plugin ids (core). Empty = any alert (incl. recovery). Non-empty = only listed failures.',
} as const

export interface NotifierTargetRouteOptions<T> {
  notifierId: string
  openapiTag: string
  configSchema: Record<string, unknown>
  readDefaults: () => T
  writeDefaults: (input: unknown) => T
  buildTargetConfigView: (stored: unknown) => NotifierTargetConfigView<T>
  normalizeTargetOverride: (input: unknown) => unknown
  resolveForTarget: (stored: unknown) => T
  isConfigured: (config: T) => boolean
  testSend: (config: T) => Promise<void>
  publishDefaultsReason: string
}

function enrichTargetConfigView<T>(
  stored: unknown,
  build: (stored: unknown) => NotifierTargetConfigView<T>,
): NotifierTargetConfigView<T> {
  const view = build(stored)
  return {
    ...view,
    check_ids: extractNotifierCheckIds(stored),
  }
}

export async function registerNotifierTargetRoutes<T>(
  app: FastifyInstance,
  opts: NotifierTargetRouteOptions<T>,
): Promise<void> {
  const targetConfigViewSchema = {
    type: 'object',
    required: ['useCustom', 'check_ids', 'defaults', 'override', 'effective'],
    properties: {
      useCustom: {type: 'boolean'},
      check_ids: checkIdsSchema,
      defaults: opts.configSchema,
      override: {type: ['object', 'null'], additionalProperties: true},
      effective: opts.configSchema,
    },
  } as const

  app.get(
    '/overrides',
    {
      schema: {
        tags: [opts.openapiTag],
        summary: `List target ids with a custom ${opts.notifierId} notifier override`,
        response: {
          200: {
            type: 'object',
            required: ['targetIds'],
            properties: {
              targetIds: {type: 'array', items: {type: 'integer'}},
            },
          },
        },
      },
    },
    async () => {
      const rows = getCore().listTargetNotifierConfigs(opts.notifierId)
      const targetIds = rows
        .filter(row => hasNotifierTargetOverride(row.config))
        .map(row => row.targetId)
      return {targetIds}
    },
  )

  app.get(
    '/targets/:targetId/config',
    {
      schema: {
        tags: [opts.openapiTag],
        summary: `Get ${opts.notifierId} defaults, override, and effective config for one target`,
        params: {
          type: 'object',
          required: ['targetId'],
          properties: {targetId: {type: 'string'}},
        },
        response: {
          200: targetConfigViewSchema,
          400: errorResponse,
          404: errorResponse,
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
      return enrichTargetConfigView(
        getCore().getTargetNotifierConfig(targetId, opts.notifierId),
        opts.buildTargetConfigView,
      )
    },
  )

  app.put<{Params: {targetId: string}; Body: Record<string, unknown>}>(
    '/targets/:targetId/config',
    {
      schema: {
        tags: [opts.openapiTag],
        summary: `Set or clear per-target ${opts.notifierId} notifier override`,
        params: {
          type: 'object',
          required: ['targetId'],
          properties: {targetId: {type: 'string'}},
        },
        body: {
          type: 'object',
          required: ['useCustom'],
          properties: {
            useCustom: {type: 'boolean'},
            check_ids: checkIdsSchema,
            ...(opts.configSchema as {properties?: Record<string, unknown>})
              .properties,
          },
        },
        response: {
          200: targetConfigViewSchema,
          400: errorResponse,
          404: errorResponse,
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
        const checkIds = normalizeNotifierCheckIds(req.body.check_ids)
        const useCustom = req.body.useCustom === true

        if (!useCustom && checkIds.length === 0) {
          getCore().deleteTargetNotifierConfig(targetId, opts.notifierId)
        } else if (!useCustom) {
          getCore().setTargetNotifierConfig(targetId, opts.notifierId, {
            useCustom: false,
            check_ids: checkIds,
          })
        } else {
          const override = opts.normalizeTargetOverride(
            stripNotifierRoutingFields(req.body),
          )
          getCore().setTargetNotifierConfig(targetId, opts.notifierId, {
            ...(override as Record<string, unknown>),
            check_ids: checkIds,
          })
        }
        publishRealtime('targets.updated', {
          action: `${opts.notifierId}-notifier-config`,
          targetId,
        })
        return enrichTargetConfigView(
          getCore().getTargetNotifierConfig(targetId, opts.notifierId),
          opts.buildTargetConfigView,
        )
      } catch (err) {
        return reply
          .code(400)
          .send({error: err instanceof Error ? err.message : String(err)})
      }
    },
  )

  app.delete(
    '/targets/:targetId/config',
    {
      schema: {
        tags: [opts.openapiTag],
        summary: `Clear per-target ${opts.notifierId} override (use defaults)`,
        params: {
          type: 'object',
          required: ['targetId'],
          properties: {targetId: {type: 'string'}},
        },
        response: {
          200: targetConfigViewSchema,
          400: errorResponse,
          404: errorResponse,
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
      getCore().deleteTargetNotifierConfig(targetId, opts.notifierId)
      publishRealtime('targets.updated', {
        action: `${opts.notifierId}-notifier-config-clear`,
        targetId,
      })
      return enrichTargetConfigView(null, opts.buildTargetConfigView)
    },
  )

  app.post<{Params: {targetId: string}; Body: Record<string, unknown>}>(
    '/targets/:targetId/test',
    {
      schema: {
        tags: [opts.openapiTag],
        summary: `Send a test alert using effective ${opts.notifierId} config for one target`,
        params: {
          type: 'object',
          required: ['targetId'],
          properties: {targetId: {type: 'string'}},
        },
        body: {
          type: 'object',
          properties: {
            useCustom: {type: 'boolean'},
            check_ids: checkIdsSchema,
            ...(opts.configSchema as {properties?: Record<string, unknown>})
              .properties,
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['ok', 'error'],
            properties: {
              ok: {type: 'boolean'},
              error: {type: ['string', 'null']},
            },
          },
          400: errorResponse,
          404: errorResponse,
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
        let config: T
        if (req.body?.useCustom === true) {
          const override = opts.normalizeTargetOverride(
            stripNotifierRoutingFields(req.body),
          )
          config = opts.resolveForTarget(override)
        } else if (req.body?.useCustom === false) {
          config = opts.resolveForTarget(null)
        } else {
          config = opts.resolveForTarget(
            getCore().getTargetNotifierConfig(targetId, opts.notifierId),
          )
        }
        if (!opts.isConfigured(config)) {
          return reply.code(400).send({error: 'notifier is not configured'})
        }
        await opts.testSend(config)
        return {ok: true, error: null}
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  )
}
