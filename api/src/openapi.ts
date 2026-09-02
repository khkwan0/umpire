import type {FastifyInstance} from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import {publicUrlPrefix, requestPublicPrefix} from './publicPath.js'

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
  required: ['alert_policy', 'throttle_minutes'],
  properties: {
    alert_policy: {
      type: 'string',
      enum: ['state_change', 'every_fail', 'throttle'],
    },
    throttle_minutes: {type: 'integer', minimum: 1},
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
  required: ['kind', 'user', 'is_admin', 'can_write', 'plugins'],
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

const apiTokenSchema = {
  $id: 'ApiToken',
  type: 'object',
  required: [
    'id',
    'user_id',
    'label',
    'token_prefix',
    'expires_at',
    'last_used_at',
    'created_at',
  ],
  properties: {
    id: {type: 'integer'},
    user_id: {type: 'integer'},
    label: {type: 'string'},
    token_prefix: {
      type: 'string',
      description: 'Leading characters of the token for identification',
    },
    expires_at: {type: ['string', 'null'], format: 'date-time'},
    last_used_at: {type: ['string', 'null'], format: 'date-time'},
    created_at: {type: 'string', format: 'date-time'},
  },
} as const

const apiTokenCreatedSchema = {
  $id: 'ApiTokenCreated',
  type: 'object',
  required: ['token', 'api_token'],
  properties: {
    token: {
      type: 'string',
      description:
        'Full secret token — shown only once; use Authorization: Bearer',
    },
    api_token: {$ref: 'ApiToken#'},
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

const pluginManagerEntrySchema = {
  $id: 'PluginManagerEntry',
  type: 'object',
  required: ['id', 'enabled'],
  properties: {
    id: {type: 'string'},
    enabled: {type: 'boolean'},
    description: {
      type: ['string', 'null'],
      description: 'Plugin description when provided by the implementation',
    },
    ready: {
      type: 'boolean',
      description: 'Notifier only — true when global config is complete',
    },
  },
} as const

const pluginManagerStateSchema = {
  $id: 'PluginManagerState',
  type: 'object',
  required: ['checks', 'scheduler', 'notifiers'],
  properties: {
    auth: {
      type: ['object', 'null'],
      required: ['id', 'enabled'],
      properties: {
        id: {type: 'string'},
        enabled: {type: 'boolean'},
        description: {type: ['string', 'null']},
      },
    },
    checks: {
      type: 'array',
      items: {$ref: 'PluginManagerEntry#'},
    },
    scheduler: {
      type: 'object',
      required: ['id', 'enabled'],
      properties: {
        id: {type: 'string'},
        enabled: {type: 'boolean'},
        description: {type: ['string', 'null']},
      },
    },
    notifiers: {
      type: 'array',
      items: {$ref: 'PluginManagerEntry#'},
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
    apiTokenSchema,
    apiTokenCreatedSchema,
    pluginRefSchema,
    notifierStatusSchema,
    statusTargetSchema,
    statusResponseSchema,
    alertCheckOutcomeSchema,
    alertEventSchema,
    coreSchemaResponseSchema,
    pluginRouteRefSchema,
    pluginCatalogEntrySchema,
    pluginManagerEntrySchema,
    pluginManagerStateSchema,
  ]) {
    app.addSchema(schema)
  }

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'UMPIRE API',
        description:
          'Universal Monitoring Plugin & Incident Reporter. Manage targets (with per-target check_ids / notifier_ids allowlists), groups, alert settings, auth/users/roles, and plugins. Plugin HTTP APIs are namespaced under /api/plugins/<kind>/<id>. See GET /api/plugins for the route catalog. Notifier plugins receive an AlertEvent (see components). Operator guide with curl examples: docs/api.md. WebSocket and SSE protocols: docs/agents.md#websockets.',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'umpire_token',
            description:
              'API token from POST /api/tokens (prefix umpire_). Send as Authorization: Bearer umpire_…. Required on protected routes when auth is enabled.',
          },
          sessionCookie: {
            type: 'apiKey',
            in: 'cookie',
            name: 'umpire_session',
            description:
              'Browser session from POST /api/auth/login. Used by the web UI and agent chat WebSocket.',
          },
        },
      },
      tags: [
        {name: 'health', description: 'Liveness'},
        {
          name: 'auth',
          description:
            'Session login/logout, auth policy, and current principal',
        },
        {
          name: 'api-tokens',
          description: 'Bearer tokens for agents and automation',
        },
        {
          name: 'agent',
          description:
            'Built-in AI agent settings and WebSocket chat (see route description for frame protocol)',
        },
        {name: 'users', description: 'User accounts (admin)'},
        {name: 'roles', description: 'Roles and plugin allowlists (admin)'},
        {name: 'groups', description: 'Group trees and tags'},
        {
          name: 'targets',
          description:
            'URLs to monitor; optional check_ids and notifier_ids (empty = all enabled)',
        },
        {name: 'checks', description: 'Loaded check plugins (inventory)'},
        {name: 'notifiers', description: 'Loaded notifier plugins (inventory)'},
        {
          name: 'plugins',
          description:
            'Plugin catalog, runtime enable/disable, and namespaced HTTP routes (/api/plugins/<kind>/<id>/…)',
        },
        {
          name: 'http-check',
          description:
            'HTTP check plugin — global defaults and per-target overrides',
        },
        {
          name: 'keyword-body-check',
          description: 'Keyword/body check plugin — per-target config',
        },
        {
          name: 'tokens',
          description:
            'FCM device destinations at /api/plugins/notify/fcm/tokens',
        },
        {
          name: 'fcm',
          description: 'FCM notifier — per-target routing overrides and tests',
        },
        {
          name: 'webhook',
          description:
            'Webhook URL, HTTP method, and headers at /api/plugins/notify/webhook/…',
        },
        {
          name: 'slack',
          description: 'Slack notifier config and per-target overrides',
        },
        {
          name: 'discord',
          description: 'Discord notifier config and per-target overrides',
        },
        {
          name: 'telegram',
          description: 'Telegram notifier config and per-target overrides',
        },
        {
          name: 'email',
          description: 'Email notifier config and per-target overrides',
        },
        {
          name: 'system',
          description:
            'WebSocket HTTP bridge and other non-REST transports (see route descriptions)',
        },
        {name: 'settings', description: 'Alert policy and auth toggles'},
        {name: 'status', description: 'Dashboard summary and SSE live updates'},
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
    // No indexPrefix: with a trailing slash, Swagger UI uses relative ./static/
    // asset URLs so /documentation/ and /umpire/documentation/ both work.
    transformSpecification: (swaggerObject, req) => {
      const prefix = requestPublicPrefix(req)
      if (!prefix) return swaggerObject
      return {
        ...swaggerObject,
        servers: [{url: prefix}],
      }
    },
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  })
}
