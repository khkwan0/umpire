import type {FastifyInstance} from 'fastify'
import {getCore} from '../../../core/index.js'
import {
  hasPluginCustomOverride,
  preserveNotifierCheckIds,
} from '../../../core/notifierRouting.js'
import {publishRealtime} from '../../../realtime.js'
import type {NotifierTargetConfigView} from './targetConfig.js'

const errorResponse = {
  type: 'object',
  properties: {error: {type: 'string'}},
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

export async function registerNotifierTargetRoutes<T>(
  app: FastifyInstance,
  opts: NotifierTargetRouteOptions<T>,
): Promise<void> {
  const targetConfigViewSchema = {
    type: 'object',
    required: ['useCustom', 'defaults', 'override', 'effective'],
    properties: {
      useCustom: {type: 'boolean'},
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
        .filter(row => hasPluginCustomOverride(row.config))
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
      return opts.buildTargetConfigView(
        getCore().getTargetNotifierConfig(targetId, opts.notifierId),
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
        const existing = getCore().getTargetNotifierConfig(
          targetId,
          opts.notifierId,
        )
        if (req.body.useCustom !== true) {
          const kept = preserveNotifierCheckIds(existing, {useCustom: false})
          if (!hasPluginCustomOverride(kept) && !kept.check_ids) {
            getCore().deleteTargetNotifierConfig(targetId, opts.notifierId)
          } else {
            getCore().setTargetNotifierConfig(targetId, opts.notifierId, kept)
          }
        } else {
          const override = opts.normalizeTargetOverride(req.body)
          getCore().setTargetNotifierConfig(
            targetId,
            opts.notifierId,
            preserveNotifierCheckIds(
              existing,
              override as Record<string, unknown>,
            ),
          )
        }
        publishRealtime('targets.updated', {
          action: `${opts.notifierId}-notifier-config`,
          targetId,
        })
        return opts.buildTargetConfigView(
          getCore().getTargetNotifierConfig(targetId, opts.notifierId),
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
      const existing = getCore().getTargetNotifierConfig(
        targetId,
        opts.notifierId,
      )
      const kept = preserveNotifierCheckIds(existing, {useCustom: false})
      if (!kept.check_ids) {
        getCore().deleteTargetNotifierConfig(targetId, opts.notifierId)
      } else {
        getCore().setTargetNotifierConfig(targetId, opts.notifierId, kept)
      }
      publishRealtime('targets.updated', {
        action: `${opts.notifierId}-notifier-config-clear`,
        targetId,
      })
      return opts.buildTargetConfigView(
        getCore().getTargetNotifierConfig(targetId, opts.notifierId),
      )
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
          const override = opts.normalizeTargetOverride(req.body)
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
