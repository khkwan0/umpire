import type { FastifyInstance } from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'

const errorSchema = {
  $id: 'Error',
  type: 'object',
  required: ['error'],
  properties: {
    error: { type: 'string' },
  },
} as const

const groupSchema = {
  $id: 'Group',
  type: 'object',
  required: ['id', 'parent', 'name', 'tag', 'created_at', 'updated_at'],
  properties: {
    id: { type: 'integer' },
    parent: {
      type: 'integer',
      description: '0 = root of a tree; otherwise parent group id',
    },
    name: { type: 'string' },
    tag: {
      type: 'string',
      description:
        'Auto tag: root group_N; child group_group_1_group_2_…',
    },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
} as const

const groupTreeNodeSchema = {
  $id: 'GroupTreeNode',
  type: 'object',
  required: [
    'id',
    'parent',
    'name',
    'tag',
    'created_at',
    'updated_at',
    'children',
  ],
  properties: {
    id: { type: 'integer' },
    parent: { type: 'integer' },
    name: { type: 'string' },
    tag: { type: 'string' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    children: {
      type: 'array',
      items: { $ref: 'GroupTreeNode#' },
    },
  },
} as const

const targetSchema = {
  $id: 'Target',
  type: 'object',
  required: [
    'id',
    'url',
    'interval_seconds',
    'enabled',
    'group_id',
    'check_ids',
    'notifier_ids',
    'created_at',
    'updated_at',
  ],
  properties: {
    id: { type: 'integer' },
    url: { type: 'string', format: 'uri' },
    interval_seconds: { type: 'integer', minimum: 5 },
    enabled: { type: 'integer', enum: [0, 1] },
    group_id: {
      type: ['integer', 'null'],
      description: 'Must be a child group id when set (not a root)',
    },
    check_ids: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Check plugin ids to run for this target. Empty = all loaded checks.',
    },
    notifier_ids: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Notifier plugin ids for this target. Empty = all loaded notifiers.',
    },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
} as const

const checkResultSchema = {
  $id: 'CheckResult',
  type: 'object',
  required: ['id', 'target_id', 'ok', 'checked_at'],
  properties: {
    id: { type: 'integer' },
    target_id: { type: 'integer' },
    ok: {
      type: 'integer',
      description: '1=up, 0=down, 2=partial',
      enum: [0, 1, 2],
    },
    status_code: { type: ['integer', 'null'] },
    error: { type: ['string', 'null'] },
    latency_ms: { type: ['integer', 'null'] },
    checked_at: { type: 'string' },
  },
} as const

const fcmTokenSchema = {
  $id: 'FcmToken',
  type: 'object',
  required: [
    'id',
    'token',
    'label',
    'enabled',
    'target_ids',
    'check_ids',
    'created_at',
    'last_test_ok',
    'last_test_error',
    'last_tested_at',
  ],
  properties: {
    id: { type: 'integer' },
    token: {
      type: 'string',
      description:
        'Firebase Installation ID (recommended) or a deprecated FCM registration token. Sends use fid unless the value looks like :APA91…',
    },
    label: { type: 'string' },
    enabled: { type: 'integer', enum: [0, 1] },
    target_ids: {
      type: 'array',
      items: { type: 'integer', minimum: 1 },
      description: 'Target ids this token receives. Empty = all targets.',
    },
    check_ids: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Check plugin ids. Empty = any alert (incl. recovery). Non-empty = only when a listed check failed.',
    },
    created_at: { type: 'string' },
    last_test_ok: {
      type: ['integer', 'null'],
      enum: [0, 1, 2, null],
      description:
        '1=confirmed received, 2=FCM accepted (not confirmed), 0=error, null=never tested',
    },
    last_test_error: { type: ['string', 'null'] },
    last_tested_at: { type: ['string', 'null'] },
  },
} as const

const settingsSchema = {
  $id: 'Settings',
  type: 'object',
  required: ['alert_policy', 'throttle_minutes'],
  properties: {
    alert_policy: {
      type: 'string',
      enum: ['state_change', 'every_fail', 'throttle'],
    },
    throttle_minutes: { type: 'integer', minimum: 1 },
  },
} as const

const pluginRefSchema = {
  $id: 'PluginRef',
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string' },
  },
} as const

const notifierStatusSchema = {
  $id: 'NotifierStatus',
  type: 'object',
  required: ['id', 'ready'],
  properties: {
    id: { type: 'string' },
    ready: { type: 'boolean' },
  },
} as const

const statusTargetSchema = {
  $id: 'StatusTarget',
  type: 'object',
  properties: {
    id: { type: 'integer' },
    url: { type: 'string' },
    interval_seconds: { type: 'integer' },
    enabled: { type: 'integer' },
    group_id: { type: ['integer', 'null'] },
    group_tag: { type: ['string', 'null'] },
    is_up: {
      type: ['integer', 'null'],
      description: '1=up, 0=down, 2=partial, null=never checked',
    },
    last_checked_at: { type: ['string', 'null'] },
    last_status_code: { type: ['integer', 'null'] },
    last_error: { type: ['string', 'null'] },
    last_latency_ms: { type: ['integer', 'null'] },
    last_alert_at: { type: ['string', 'null'] },
  },
} as const

const statusResponseSchema = {
  $id: 'StatusResponse',
  type: 'object',
  required: ['core', 'checks', 'scheduler', 'notifiers', 'settings', 'targets'],
  properties: {
    core: {
      type: 'object',
      required: ['engine'],
      properties: { engine: { type: 'string' } },
    },
    checks: { type: 'array', items: { $ref: 'PluginRef#' } },
    scheduler: { $ref: 'PluginRef#' },
    notifiers: { type: 'array', items: { $ref: 'NotifierStatus#' } },
    settings: { $ref: 'Settings#' },
    targets: { type: 'array', items: { $ref: 'StatusTarget#' } },
  },
} as const

/** Webhook notifier POST body (and plugin notify contract). Not an HTTP response. */
const alertCheckOutcomeSchema = {
  $id: 'AlertCheckOutcome',
  type: 'object',
  required: ['id', 'ok', 'statusCode', 'error', 'latencyMs'],
  properties: {
    id: { type: 'string', description: 'Check plugin id' },
    ok: { type: 'boolean' },
    statusCode: { type: ['integer', 'null'] },
    error: { type: ['string', 'null'] },
    latencyMs: { type: 'number' },
  },
} as const

const alertEventSchema = {
  $id: 'AlertEvent',
  type: 'object',
  required: [
    'target',
    'status',
    'previousStatus',
    'error',
    'statusCode',
    'checkedAt',
    'title',
    'body',
    'checks',
  ],
  description:
    'Payload passed to notifier plugins. The webhook notifier POSTs this JSON to its configured URL.',
  properties: {
    target: {
      type: 'object',
      required: ['id', 'url'],
      properties: {
        id: { type: 'integer' },
        url: { type: 'string' },
      },
    },
    status: { type: 'string', enum: ['up', 'down', 'partial'] },
    previousStatus: {
      type: 'string',
      enum: ['up', 'down', 'partial', 'unknown'],
    },
    error: { type: ['string', 'null'] },
    statusCode: { type: ['integer', 'null'] },
    checkedAt: { type: 'string', format: 'date-time' },
    title: { type: 'string' },
    body: { type: 'string' },
    checks: {
      type: 'array',
      description:
        'Per-check outcomes for this run. Empty if no checks ran. Use for routing; do not parse error/body for check ids.',
      items: { $ref: 'AlertCheckOutcome#' },
    },
  },
} as const

const coreSchemaResponseSchema = {
  $id: 'CoreSchemaResponse',
  type: 'object',
  required: ['engine', 'tables'],
  properties: {
    engine: { type: 'string', enum: ['sqlite'] },
    tables: {
      type: 'array',
      description:
        'Frozen core tables (includes targets.check_ids and targets.notifier_ids)',
      items: { type: 'object' },
    },
    data: {
      type: 'object',
      description: 'Present when ?data=1 — map of table name → row arrays',
      additionalProperties: {
        type: 'array',
        items: { type: 'object' },
      },
    },
  },
} as const

const pluginRouteRefSchema = {
  $id: 'PluginRouteRef',
  type: 'object',
  required: ['method', 'path'],
  properties: {
    method: { type: 'string', description: 'HTTP method (e.g. GET)' },
    path: {
      type: 'string',
      description: 'Fully qualified path (e.g. /api/plugins/notify/fcm/tokens)',
    },
  },
} as const

const pluginCatalogEntrySchema = {
  $id: 'PluginCatalogEntry',
  type: 'object',
  required: ['id', 'kind', 'routes'],
  properties: {
    id: { type: 'string' },
    kind: { type: 'string', enum: ['check', 'scheduler', 'notify'] },
    routes: {
      type: 'array',
      items: { $ref: 'PluginRouteRef#' },
      description:
        'HTTP routes registered under /api/plugins/<kind>/<id>. Empty if the plugin has no registerRoutes.',
    },
  },
} as const

export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  for (const schema of [
    errorSchema,
    groupSchema,
    groupTreeNodeSchema,
    targetSchema,
    checkResultSchema,
    fcmTokenSchema,
    settingsSchema,
    pluginRefSchema,
    notifierStatusSchema,
    statusTargetSchema,
    statusResponseSchema,
    alertCheckOutcomeSchema,
    alertEventSchema,
    coreSchemaResponseSchema,
    pluginRouteRefSchema,
    pluginCatalogEntrySchema,
  ]) {
    app.addSchema(schema)
  }

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'UMPIRE API',
        description:
          'Universal Monitoring Plugin & Incident Reporter. Manage targets (with per-target check_ids / notifier_ids allowlists), groups, alert settings, and plugins. Plugin HTTP APIs are namespaced under /api/plugins/<kind>/<id>. See GET /api/plugins for the route catalog. Notifier plugins receive an AlertEvent (see components); the webhook notifier POSTs that JSON body to the URL set in its UI.',
        version: '1.0.0',
      },
      tags: [
        { name: 'health', description: 'Liveness' },
        { name: 'groups', description: 'Group trees and tags' },
        {
          name: 'targets',
          description:
            'URLs to monitor; optional check_ids and notifier_ids (empty = all loaded)',
        },
        { name: 'checks', description: 'Loaded check plugins' },
        { name: 'notifiers', description: 'Loaded notifier plugins' },
        {
          name: 'plugins',
          description:
            'Loaded plugins and their namespaced HTTP routes (/api/plugins/<kind>/<id>/…)',
        },
        {
          name: 'tokens',
          description:
            'FCM destinations (FID preferred) at /api/plugins/notify/fcm/tokens (fcm notifier)',
        },
        {
          name: 'webhook',
          description:
            'Webhook URL and headers at /api/plugins/notify/webhook/config (webhook notifier)',
        },
        { name: 'settings', description: 'Alert policy' },
        { name: 'status', description: 'Dashboard summary' },
        { name: 'schema', description: 'Frozen core SQLite schema' },
      ],
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  })
}
