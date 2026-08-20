import type {FastifyInstance} from 'fastify'
import {getCore} from '../core/index.js'
import {normalizePluginIds} from '../core/sqlite.js'
import {getChecks, getScheduler} from '../plugins/registry.js'
import {publishRealtime} from '../realtime.js'

const errorResponse = {
  type: 'object',
  properties: {error: {type: 'string'}},
} as const

const checkIdsSchema = {
  type: 'array',
  items: {type: 'string', minLength: 1},
  description: 'Check plugin ids to run. Empty array = all loaded checks.',
} as const

const notifierIdsSchema = {
  type: 'array',
  items: {type: 'string', minLength: 1},
  description:
    'Notifier plugin ids for alerts. Empty array = all loaded notifiers.',
} as const

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function parseIdListBody(
  raw: unknown,
  fieldName: string,
): {ok: true; value?: string[]} | {ok: false; error: string} {
  if (raw === undefined) return {ok: true}
  try {
    return {ok: true, value: normalizePluginIds(raw, fieldName)}
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function targetsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/targets',
    {
      schema: {
        tags: ['targets'],
        summary: 'List targets',
        response: {
          200: {type: 'array', items: {$ref: 'Target#'}},
        },
      },
    },
    async () => getCore().listTargets(),
  )

  app.post<{
    Body: {
      url?: string
      interval_seconds?: number
      enabled?: boolean
      group_id?: number | null
      check_ids?: string[]
      notifier_ids?: string[]
    }
  }>(
    '/api/targets',
    {
      schema: {
        tags: ['targets'],
        summary: 'Create target',
        body: {
          type: 'object',
          required: ['url'],
          properties: {
            url: {type: 'string', format: 'uri'},
            interval_seconds: {type: 'integer', minimum: 5, default: 60},
            enabled: {type: 'boolean', default: true},
            group_id: {
              type: ['integer', 'null'],
              description: 'Child group id only (not a root)',
            },
            check_ids: checkIdsSchema,
            notifier_ids: notifierIdsSchema,
          },
        },
        response: {
          201: {$ref: 'Target#'},
          400: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const url = req.body?.url?.trim()
      const interval = Number(req.body?.interval_seconds ?? 60)
      const enabled = req.body?.enabled !== false
      const groupId =
        req.body?.group_id === undefined ? null : req.body.group_id
      const checkIdsParsed = parseIdListBody(req.body?.check_ids, 'check_ids')
      if (!checkIdsParsed.ok) {
        return reply.code(400).send({error: checkIdsParsed.error})
      }
      const notifierIdsParsed = parseIdListBody(
        req.body?.notifier_ids,
        'notifier_ids',
      )
      if (!notifierIdsParsed.ok) {
        return reply.code(400).send({error: notifierIdsParsed.error})
      }
      if (!url || !isValidUrl(url)) {
        return reply.code(400).send({error: 'valid http(s) url required'})
      }
      if (!Number.isFinite(interval) || interval < 5) {
        return reply.code(400).send({error: 'interval_seconds must be >= 5'})
      }
      if (groupId !== null && (!Number.isInteger(groupId) || groupId < 1)) {
        return reply
          .code(400)
          .send({error: 'group_id must be a group id or null'})
      }
      try {
        const target = getCore().createTarget(
          url,
          interval,
          enabled,
          groupId,
          checkIdsParsed.value ?? [],
          notifierIdsParsed.value ?? [],
        )
        getScheduler().reschedule()
        publishRealtime('targets.updated', {
          action: 'create',
          targetId: target.id,
        })
        publishRealtime('status.updated', {reason: 'targets'})
        return reply.code(201).send(target)
      } catch (err) {
        return reply
          .code(400)
          .send({error: err instanceof Error ? err.message : String(err)})
      }
    },
  )

  app.patch<{
    Params: {id: string}
    Body: {
      url?: string
      interval_seconds?: number
      enabled?: boolean
      group_id?: number | null
      check_ids?: string[]
      notifier_ids?: string[]
    }
  }>(
    '/api/targets/:id',
    {
      schema: {
        tags: ['targets'],
        summary: 'Update target',
        params: {
          type: 'object',
          required: ['id'],
          properties: {id: {type: 'string'}},
        },
        body: {
          type: 'object',
          properties: {
            url: {type: 'string', format: 'uri'},
            interval_seconds: {type: 'integer', minimum: 5},
            enabled: {type: 'boolean'},
            group_id: {type: ['integer', 'null']},
            check_ids: checkIdsSchema,
            notifier_ids: notifierIdsSchema,
          },
        },
        response: {
          200: {$ref: 'Target#'},
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      if (!Number.isInteger(id))
        return reply.code(400).send({error: 'invalid id'})
      if (req.body?.url !== undefined && !isValidUrl(req.body.url)) {
        return reply.code(400).send({error: 'valid http(s) url required'})
      }
      if (
        req.body?.interval_seconds !== undefined &&
        (!Number.isFinite(req.body.interval_seconds) ||
          req.body.interval_seconds < 5)
      ) {
        return reply.code(400).send({error: 'interval_seconds must be >= 5'})
      }
      if (
        req.body?.group_id !== undefined &&
        req.body.group_id !== null &&
        (!Number.isInteger(req.body.group_id) || req.body.group_id < 1)
      ) {
        return reply
          .code(400)
          .send({error: 'group_id must be a group id or null'})
      }
      const checkIdsParsed = parseIdListBody(req.body?.check_ids, 'check_ids')
      if (!checkIdsParsed.ok) {
        return reply.code(400).send({error: checkIdsParsed.error})
      }
      const notifierIdsParsed = parseIdListBody(
        req.body?.notifier_ids,
        'notifier_ids',
      )
      if (!notifierIdsParsed.ok) {
        return reply.code(400).send({error: notifierIdsParsed.error})
      }
      try {
        const patch: {
          url?: string
          interval_seconds?: number
          enabled?: boolean
          group_id?: number | null
          check_ids?: string[]
          notifier_ids?: string[]
        } = {...(req.body ?? {})}
        if (checkIdsParsed.value !== undefined) {
          patch.check_ids = checkIdsParsed.value
        }
        if (notifierIdsParsed.value !== undefined) {
          patch.notifier_ids = notifierIdsParsed.value
        }
        const updated = getCore().updateTarget(id, patch)
        if (!updated) return reply.code(404).send({error: 'not found'})
        getScheduler().reschedule()
        publishRealtime('targets.updated', {action: 'update', targetId: id})
        publishRealtime('status.updated', {reason: 'targets'})
        return updated
      } catch (err) {
        return reply
          .code(400)
          .send({error: err instanceof Error ? err.message : String(err)})
      }
    },
  )

  app.delete<{Params: {id: string}}>(
    '/api/targets/:id',
    {
      schema: {
        tags: ['targets'],
        summary: 'Delete target',
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
      if (!Number.isInteger(id))
        return reply.code(400).send({error: 'invalid id'})
      const ok = getCore().deleteTarget(id)
      if (!ok) return reply.code(404).send({error: 'not found'})
      getScheduler().reschedule()
      publishRealtime('targets.updated', {action: 'delete', targetId: id})
      publishRealtime('status.updated', {reason: 'targets'})
      return reply.code(204).send()
    },
  )

  app.get<{Params: {id: string}}>(
    '/api/targets/:id/results',
    {
      schema: {
        tags: ['targets'],
        summary: 'Recent check results for a target',
        params: {
          type: 'object',
          required: ['id'],
          properties: {id: {type: 'string'}},
        },
        response: {
          200: {type: 'array', items: {$ref: 'CheckResult#'}},
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      if (!Number.isInteger(id))
        return reply.code(400).send({error: 'invalid id'})
      if (!getCore().getTarget(id))
        return reply.code(404).send({error: 'not found'})
      return getCore().listRecentResults(id, 100)
    },
  )

  app.get<{Params: {id: string; checkId: string}}>(
    '/api/targets/:id/checks/:checkId/config',
    {
      schema: {
        tags: ['targets'],
        summary: 'Get per-target config for a check plugin',
        params: {
          type: 'object',
          required: ['id', 'checkId'],
          properties: {
            id: {type: 'string'},
            checkId: {type: 'string'},
          },
        },
        response: {
          200: {type: 'object', additionalProperties: true},
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      if (!Number.isInteger(id))
        return reply.code(400).send({error: 'invalid id'})
      if (!getCore().getTarget(id))
        return reply.code(404).send({error: 'not found'})
      const checkId = req.params.checkId.trim()
      if (!checkId) return reply.code(400).send({error: 'invalid checkId'})
      const config = getCore().getTargetCheckConfig(id, checkId)
      return config && typeof config === 'object' ? config : {}
    },
  )

  app.put<{
    Params: {id: string; checkId: string}
    Body: Record<string, unknown>
  }>(
    '/api/targets/:id/checks/:checkId/config',
    {
      schema: {
        tags: ['targets'],
        summary: 'Set per-target config for a check plugin',
        params: {
          type: 'object',
          required: ['id', 'checkId'],
          properties: {
            id: {type: 'string'},
            checkId: {type: 'string'},
          },
        },
        body: {type: 'object', additionalProperties: true},
        response: {
          200: {type: 'object', additionalProperties: true},
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      if (!Number.isInteger(id))
        return reply.code(400).send({error: 'invalid id'})
      if (!getCore().getTarget(id))
        return reply.code(404).send({error: 'not found'})
      const checkId = req.params.checkId.trim()
      if (!checkId) return reply.code(400).send({error: 'invalid checkId'})
      if (!getChecks().some(c => c.id === checkId)) {
        return reply
          .code(404)
          .send({error: `check plugin "${checkId}" not found`})
      }
      if (
        !req.body ||
        typeof req.body !== 'object' ||
        Array.isArray(req.body)
      ) {
        return reply.code(400).send({error: 'body must be a JSON object'})
      }
      getCore().setTargetCheckConfig(id, checkId, req.body)
      publishRealtime('targets.updated', {
        action: 'config-update',
        targetId: id,
        checkId,
      })
      return req.body
    },
  )

  app.delete<{Params: {id: string; checkId: string}}>(
    '/api/targets/:id/checks/:checkId/config',
    {
      schema: {
        tags: ['targets'],
        summary: 'Delete per-target config override for a check plugin',
        params: {
          type: 'object',
          required: ['id', 'checkId'],
          properties: {
            id: {type: 'string'},
            checkId: {type: 'string'},
          },
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
      if (!Number.isInteger(id))
        return reply.code(400).send({error: 'invalid id'})
      if (!getCore().getTarget(id))
        return reply.code(404).send({error: 'not found'})
      const checkId = req.params.checkId.trim()
      if (!checkId) return reply.code(400).send({error: 'invalid checkId'})
      getCore().deleteTargetCheckConfig(id, checkId)
      publishRealtime('targets.updated', {
        action: 'config-delete',
        targetId: id,
        checkId,
      })
      return reply.code(204).send()
    },
  )
}
