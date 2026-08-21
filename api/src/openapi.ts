import type {FastifyInstance} from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'

const errorSchema = {
  $id: 'Error',
  type: 'object',
  required: ['error'],
  properties: {
    error: {type: 'string'},
  },
} as const

const groupSchema = {
  $id: 'Group',
  type: 'object',
  required: ['id', 'parent', 'name', 'tag', 'created_at', 'updated_at'],
  properties: {
    id: {type: 'integer'},
    parent: {
      type: 'integer',
      description: '0 = root of a tree; otherwise parent group id',
    },
    name: {type: 'string'},
    tag: {
      type: 'string',
      description: 'Auto tag: root group_N; child group_group_1_group_2_…',
    },
    created_at: {type: 'string'},
    updated_at: {type: 'string'},
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
    id: {type: 'integer'},
    parent: {type: 'integer'},
    name: {type: 'string'},
    tag: {type: 'string'},
    created_at: {type: 'string'},
    updated_at: {type: 'string'},
    children: {
      type: 'array',
      items: {$ref: 'GroupTreeNode#'},
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
    id: {type: 'integer'},
    url: {
      type: 'string',
      description:
        'http(s) URL, or bare hostname / IP (optional :port). Field name is historical.',
    },
    interval_seconds: {type: 'integer', minimum: 5},
    enabled: {type: 'integer', enum: [0, 1]},
    group_id: {
      type: ['integer', 'null'],
      description: 'Must be a child group id when set (not a root)',
    },
    check_ids: {
      type: 'array',
      items: {type: 'string'},
      description:
        'Check plugin ids to run for this target. Empty = all loaded checks.',
    },
    notifier_ids: {
      type: 'array',
      items: {type: 'string'},
      description:
        'Notifier plugin ids for this target. Empty = all loaded notifiers.',
    },
    created_at: {type: 'string'},
    updated_at: {type: 'string'},
  },
} as const

const incidentSchema = {
  $id: 'Incident',
  type: 'object',
  required: [
    'id',
    'target_id',
    'url',
    'group_tag',
    'status',
    'recovered',
    'started_at',
    'recovered_at',
    'duration_seconds',
    'error',
    'status_code',
  ],
  properties: {
    id: {
      type: 'integer',
      description: 'check_results.id where the outage began',
    },
    target_id: {type: 'integer'},
    url: {type: 'string'},
    group_tag: {type: ['string', 'null']},
    status: {
      type: 'string',
      enum: ['down', 'partial'],
      description: 'Most severe status during the outage window',
    },
    recovered: {type: 'boolean'},
    started_at: {type: 'string'},
    recovered_at: {type: ['string', 'null']},
    duration_seconds: {
      type: ['integer', 'null'],
      description:
        'Elapsed seconds from start to recovery, or to now if still ongoing',
    },
    error: {type: ['string', 'null']},
    status_code: {type: ['integer', 'null']},
  },
} as const

const checkResultSchema = {
  $id: 'CheckResult',
  type: 'object',
  required: ['id', 'target_id', 'ok', 'checked_at'],
  properties: {
    id: {type: 'integer'},
    target_id: {type: 'integer'},
    ok: {
      type: 'integer',
      description: '1=up, 0=down, 2=partial',
      enum: [0, 1, 2],
    },
    status_code: {type: ['integer', 'null']},
    error: {type: ['string', 'null']},
    latency_ms: {type: ['integer', 'null']},
    checked_at: {type: 'string'},
  },
} as const

const settingsSchema = {
  $id: 'Settings',
  type: 'object',
  required: [
    'alert_policy',
    'throttle_minutes',
    'auth_enabled',
    'allow_readonly_without_auth',
  ],
  properties: {
    alert_policy: {
      type: 'string',
      enum: ['state_change', 'every_fail', 'throttle'],
    },
    throttle_minutes: {type: 'integer', minimum: 1},
    auth_enabled: {type: 'boolean'},
    allow_readonly_without_auth: {type: 'boolean'},
  },
} as const

const rolePluginRefSchema = {
  $id: 'RolePluginRef',
  type: 'object',
  required: ['kind', 'id'],
  properties: {
    kind: {type: 'string', enum: ['check', 'notify', 'scheduler']},
    id: {type: 'string'},
  },
} as const

const roleSchema = {
  $id: 'Role',
  type: 'object',
  required: [
    'id',
    'slug',
    'name',
    'is_system',
    'can_write',
    'plugins',
    'created_at',
    'updated_at',
  ],
  properties: {
    id: {type: 'integer'},
    slug: {type: 'string'},
    name: {type: 'string'},
    is_system: {type: 'boolean'},
    can_write: {type: 'boolean'},
    plugins: {
      oneOf: [
        {type: 'string', enum: ['all']},
        {type: 'array', items: {$ref: 'RolePluginRef#'}},
      ],
    },
    created_at: {type: 'string'},
    updated_at: {type: 'string'},
  },
} as const

const userSchema = {
  $id: 'User',
  type: 'object',
  required: [
    'id',
    'username',
    'role_id',
    'role_slug',
    'created_at',
    'updated_at',
  ],
  properties: {
    id: {type: 'integer'},
    username: {type: 'string'},
    role_id: {type: 'integer'},
    role_slug: {type: 'string'},
    created_at: {type: 'string'},
    updated_at: {type: 'string'},
  },
} as const

const authPrincipalSchema = {
  $id: 'AuthPrincipal',
  type: 'object',
  required: [
    'kind',
    'user',
    'is_admin',
    'can_write',
    'plugins',
    'single_user_mode',
  ],
  properties: {
    kind: {type: 'string', enum: ['anonymous', 'user']},
    user: {oneOf: [{$ref: 'User#'}, {type: 'null'}]},
    is_admin: {type: 'boolean'},
    can_write: {type: 'boolean'},
    plugins: {
      oneOf: [
        {type: 'string', enum: ['all']},
        {type: 'array', items: {$ref: 'RolePluginRef#'}},
      ],
    },
    single_user_mode: {type: 'boolean'},
  },
} as const

const authMeSchema = {
  $id: 'AuthMe',
  type: 'object',
  required: ['principal'],
  properties: {
    principal: {$ref: 'AuthPrincipal#'},
  },
} as const

const pluginRefSchema = {
  $id: 'PluginRef',
  type: 'object',
  required: ['id'],
  properties: {
    id: {type: 'string'},
  },
} as const

const notifierStatusSchema = {
  $id: 'NotifierStatus',
  type: 'object',
  required: ['id', 'ready'],
  properties: {
    id: {type: 'string'},
    ready: {type: 'boolean'},
  },
} as const

const statusTargetSchema = {
  $id: 'StatusTarget',
  type: 'object',
  properties: {
    id: {type: 'integer'},
    url: {type: 'string'},
    interval_seconds: {type: 'integer'},
    enabled: {type: 'integer'},
    group_id: {type: ['integer', 'null']},
    group_tag: {type: ['string', 'null']},
    is_up: {
      type: ['integer', 'null'],
      description: '1=up, 0=down, 2=partial, null=never checked',
    },
    last_checked_at: {type: ['string', 'null']},
    last_status_code: {type: ['integer', 'null']},
    last_error: {type: ['string', 'null']},
    last_latency_ms: {type: ['integer', 'null']},
    last_alert_at: {type: ['string', 'null']},
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
      properties: {engine: {type: 'string'}},
    },
    checks: {type: 'array', items: {$ref: 'PluginRef#'}},
    scheduler: {$ref: 'PluginRef#'},
    notifiers: {type: 'array', items: {$ref: 'NotifierStatus#'}},
    settings: {$ref: 'Settings#'},
    targets: {type: 'array', items: {$ref: 'StatusTarget#'}},
  },
} as const

/** Webhook notifier POST body (and plugin notify contract). Not an HTTP response. */
const alertCheckOutcomeSchema = {
  $id: 'AlertCheckOutcome',
  type: 'object',
  required: ['id', 'ok', 'statusCode', 'error', 'latencyMs'],
  properties: {
    id: {type: 'string', description: 'Check plugin id'},
    ok: {type: 'boolean'},
    statusCode: {type: ['integer', 'null']},
    error: {type: ['string', 'null']},
    latencyMs: {type: 'number'},
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
    'Payload passed to notifier plugins. The webhook notifier sends this JSON (body or query, depending on method) to its configured URL.',
  properties: {
    target: {
      type: 'object',
      required: ['id', 'url'],
      properties: {
        id: {type: 'integer'},
        url: {type: 'string'},
      },
    },
    status: {type: 'string', enum: ['up', 'down', 'partial']},
    previousStatus: {
      type: 'string',
      enum: ['up', 'down', 'partial', 'unknown'],
    },
    error: {type: ['string', 'null']},
    statusCode: {type: ['integer', 'null']},
    checkedAt: {type: 'string', format: 'date-time'},
    title: {type: 'string'},
    body: {type: 'string'},
    checks: {
      type: 'array',
      description:
        'Per-check outcomes for this run. Empty if no checks ran. Use for routing; do not parse error/body for check ids.',
      items: {$ref: 'AlertCheckOutcome#'},
    },
  },
} as const

const coreSchemaResponseSchema = {
  $id: 'CoreSchemaResponse',
  type: 'object',
  required: ['engine', 'tables'],
  properties: {
    engine: {type: 'string', enum: ['sqlite']},
    tables: {
      type: 'array',
      description:
        'Frozen core tables (includes targets.check_ids and targets.notifier_ids)',
      items: {type: 'object'},
    },
    data: {
      type: 'object',
      description: 'Present when ?data=1 — map of table name → row arrays',
      additionalProperties: {
        type: 'array',
        items: {type: 'object'},
      },
    },
  },
} as const

const pluginRouteRefSchema = {
  $id: 'PluginRouteRef',
  type: 'object',
  required: ['method', 'path'],
  properties: {
    method: {type: 'string', description: 'HTTP method (e.g. GET)'},
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
    id: {type: 'string'},
    kind: {type: 'string', enum: ['check', 'scheduler', 'notify']},
    routes: {
      type: 'array',
      items: {$ref: 'PluginRouteRef#'},
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
    incidentSchema,
    checkResultSchema,
    settingsSchema,
    rolePluginRefSchema,
    roleSchema,
    userSchema,
    authPrincipalSchema,
    authMeSchema,
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
          'Universal Monitoring Plugin & Incident Reporter. Manage targets (with per-target check_ids / notifier_ids allowlists), groups, alert settings, auth/users/roles, and plugins. Plugin HTTP APIs are namespaced under /api/plugins/<kind>/<id>. See GET /api/plugins for the route catalog. Notifier plugins receive an AlertEvent (see components); the webhook notifier delivers that JSON with the HTTP method set in its UI.',
        version: '1.0.0',
      },
      tags: [
        {name: 'health', description: 'Liveness'},
        {name: 'auth', description: 'Session and auth policy'},
        {name: 'users', description: 'User accounts (admin)'},
        {name: 'roles', description: 'Roles and plugin allowlists (admin)'},
        {name: 'groups', description: 'Group trees and tags'},
        {
          name: 'targets',
          description:
            'URLs to monitor; optional check_ids and notifier_ids (empty = all loaded)',
        },
        {name: 'checks', description: 'Loaded check plugins'},
        {name: 'notifiers', description: 'Loaded notifier plugins'},
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
            'Webhook URL, HTTP method, and headers at /api/plugins/notify/webhook/config (webhook notifier)',
        },
        {name: 'settings', description: 'Alert policy and auth toggles'},
        {name: 'status', description: 'Dashboard summary'},
        {
          name: 'incidents',
          description: 'Outage and recovery log from check history',
        },
        {name: 'schema', description: 'Frozen core SQLite schema'},
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
