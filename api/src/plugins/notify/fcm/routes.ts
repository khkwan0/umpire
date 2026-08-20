import type {FastifyInstance} from 'fastify'
import {registerNotifierTargetRoutes} from '../shared/targetRoutes.js'
import {
  buildTargetConfigView,
  destinationsForConfig,
  isConfigured,
  normalizeTargetOverride,
  readDefaults,
  resolveFcmConfigForTarget,
  type FcmConfig,
} from './config.js'
import {
  createDestination,
  deleteDestination,
  getDestination,
  importDestinations,
  listDestinations,
  recordDestinationTest,
  updateDestination,
} from './destinations.js'
import {isUnregisteredTokenError, sendToMany, testPushCopy} from './send.js'

const errorResponse = {
  type: 'object',
  properties: {error: {type: 'string'}},
} as const

const configSchema = {
  type: 'object',
  required: ['token_ids'],
  properties: {
    token_ids: {
      type: 'array',
      items: {type: 'integer', minimum: 1},
      description:
        'Destination ids to notify. Empty = all enabled destinations.',
    },
  },
} as const

const fcmDestinationSchema = {$ref: 'FcmDestination#'} as const

const fcmDestinationTestSchema = {
  type: 'object',
  required: ['ok', 'error'],
  properties: {
    ok: {type: 'boolean'},
    error: {type: ['string', 'null']},
  },
} as const

async function testFcmConfig(config: FcmConfig): Promise<void> {
  const destinations = destinationsForConfig(config)
  if (destinations.length === 0) {
    throw new Error('no destinations configured')
  }
  const fids = destinations.map(d => d.fid)
  const copy = testPushCopy(fids[0]!)
  const res = await sendToMany(fids, copy.title, copy.body)
  if (res.successCount === 0) {
    throw new Error(res.errors[0] ?? 'send failed')
  }
}

export async function registerFcmRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/tokens',
    {
      schema: {
        tags: ['tokens'],
        summary: 'List FCM destinations',
        description:
          'Owned by the fcm notifier. Mounted at /api/plugins/notify/fcm/tokens. Routing (which destinations and checks) is configured in FCM defaults and per-target overrides.',
        response: {
          200: {type: 'array', items: fcmDestinationSchema},
        },
      },
    },
    async () => listDestinations(),
  )

  app.post(
    '/tokens/import',
    {
      schema: {
        tags: ['tokens'],
        summary: 'Import FCM FIDs from a JSON array',
        description:
          'Body is { "fids": [...] }. Each item may be a FID string or { fid, label? }. Duplicates are skipped.',
        body: {
          type: 'object',
          properties: {
            fids: {
              type: 'array',
              minItems: 1,
              items: {
                oneOf: [
                  {type: 'string'},
                  {
                    type: 'object',
                    required: ['fid'],
                    properties: {
                      fid: {type: 'string'},
                      label: {type: 'string'},
                    },
                  },
                ],
              },
            },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['created', 'skipped'],
            properties: {
              created: {type: 'array', items: fcmDestinationSchema},
              skipped: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['fid', 'reason'],
                  properties: {
                    fid: {type: 'string'},
                    reason: {type: 'string'},
                  },
                },
              },
            },
          },
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      try {
        return importDestinations(req.body)
      } catch (err) {
        return reply
          .code(400)
          .send({error: err instanceof Error ? err.message : String(err)})
      }
    },
  )

  app.post<{Body: {fid?: string}}>(
    '/tokens/test',
    {
      schema: {
        tags: ['tokens'],
        summary: 'Send a test push to a raw FID (does not persist)',
        body: {
          type: 'object',
          required: ['fid'],
          properties: {fid: {type: 'string'}},
        },
        response: {
          200: fcmDestinationTestSchema,
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const fid = (req.body?.fid ?? '').trim()
      if (!fid) {
        return reply.code(400).send({error: 'fid required'})
      }
      const copy = testPushCopy(fid)
      const res = await sendToMany([fid], copy.title, copy.body)
      return {
        ok: res.successCount > 0,
        error: res.errors[0] ?? null,
      }
    },
  )

  app.post<{Params: {id: string}}>(
    '/tokens/:id/test',
    {
      schema: {
        tags: ['tokens'],
        summary: 'Send a test push to a stored FID and record the result',
        params: {
          type: 'object',
          required: ['id'],
          properties: {id: {type: 'string'}},
        },
        response: {
          200: fcmDestinationSchema,
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      if (!Number.isInteger(id)) {
        return reply.code(400).send({error: 'invalid id'})
      }
      const row = getDestination(id)
      if (!row) return reply.code(404).send({error: 'not found'})
      const copy = testPushCopy(row.fid)
      const result = await sendToMany([row.fid], copy.title, copy.body)
      const ok = result.successCount > 0
      const error = result.errors[0] ?? null
      const updated = ok
        ? recordDestinationTest(id, 'sent', null)
        : recordDestinationTest(id, 'error', error, {
            enabled: isUnregisteredTokenError(error || '') ? false : undefined,
          })
      if (!updated) return reply.code(404).send({error: 'not found'})
      return updated
    },
  )

  app.post<{Params: {id: string}; Body: {received?: boolean}}>(
    '/tokens/:id/received',
    {
      schema: {
        tags: ['tokens'],
        summary: 'Confirm whether a test push actually appeared on the device',
        params: {
          type: 'object',
          required: ['id'],
          properties: {id: {type: 'string'}},
        },
        body: {
          type: 'object',
          required: ['received'],
          properties: {received: {type: 'boolean'}},
        },
        response: {
          200: fcmDestinationSchema,
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      if (!Number.isInteger(id)) {
        return reply.code(400).send({error: 'invalid id'})
      }
      if (typeof req.body?.received !== 'boolean') {
        return reply.code(400).send({error: 'received required'})
      }
      const updated = req.body.received
        ? recordDestinationTest(id, 'ok', null)
        : recordDestinationTest(id, 'error', 'not received', {enabled: false})
      if (!updated) return reply.code(404).send({error: 'not found'})
      return updated
    },
  )

  app.post<{Body: {fid?: string; label?: string}}>(
    '/tokens',
    {
      schema: {
        tags: ['tokens'],
        summary: 'Add an FCM FID destination',
        body: {
          type: 'object',
          required: ['fid'],
          properties: {
            fid: {type: 'string'},
            label: {type: 'string'},
          },
        },
        response: {
          201: fcmDestinationSchema,
          400: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const fid = (req.body?.fid ?? '').trim()
      const label = (req.body?.label ?? '').trim()
      if (!fid) {
        return reply.code(400).send({error: 'fid required'})
      }
      try {
        const row = createDestination(fid, label)
        return reply.code(201).send(row)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('UNIQUE') || message.includes('already exists')) {
          return reply.code(409).send({error: 'fid already exists'})
        }
        return reply.code(400).send({error: message})
      }
    },
  )

  app.patch<{
    Params: {id: string}
    Body: {fid?: string; label?: string; enabled?: boolean}
  }>(
    '/tokens/:id',
    {
      schema: {
        tags: ['tokens'],
        summary: 'Update FCM destination (label, FID, enabled)',
        params: {
          type: 'object',
          required: ['id'],
          properties: {id: {type: 'string'}},
        },
        body: {
          type: 'object',
          properties: {
            fid: {type: 'string'},
            label: {type: 'string'},
            enabled: {type: 'boolean'},
          },
        },
        response: {
          200: fcmDestinationSchema,
          400: errorResponse,
          404: errorResponse,
          409: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      if (!Number.isInteger(id)) {
        return reply.code(400).send({error: 'invalid id'})
      }
      try {
        const patch: {
          fid?: string
          label?: string
          enabled?: boolean
        } = {}
        if (req.body?.fid !== undefined) {
          const fid = req.body.fid.trim()
          if (!fid) {
            return reply.code(400).send({error: 'fid required'})
          }
          patch.fid = fid
        }
        if (req.body?.label !== undefined) patch.label = req.body.label
        if (req.body?.enabled !== undefined) patch.enabled = req.body.enabled
        const updated = updateDestination(id, patch)
        if (!updated) return reply.code(404).send({error: 'not found'})
        return updated
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('UNIQUE') || message.includes('already exists')) {
          return reply.code(409).send({error: 'fid already exists'})
        }
        return reply.code(400).send({error: message})
      }
    },
  )

  app.delete<{Params: {id: string}}>(
    '/tokens/:id',
    {
      schema: {
        tags: ['tokens'],
        summary: 'Delete FCM destination',
        params: {
          type: 'object',
          required: ['id'],
          properties: {id: {type: 'string'}},
        },
        response: {
          204: {type: 'null', description: 'Deleted'},
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      if (!Number.isInteger(id)) {
        return reply.code(400).send({error: 'invalid id'})
      }
      const ok = deleteDestination(id)
      if (!ok) return reply.code(404).send({error: 'not found'})
      return reply.code(204).send()
    },
  )

  await registerNotifierTargetRoutes(app, {
    notifierId: 'fcm',
    openapiTag: 'fcm',
    configSchema,
    readDefaults,
    writeDefaults: readDefaults,
    buildTargetConfigView,
    normalizeTargetOverride,
    resolveForTarget: resolveFcmConfigForTarget,
    isConfigured,
    testSend: testFcmConfig,
    publishDefaultsReason: 'fcm-config',
  })
}
