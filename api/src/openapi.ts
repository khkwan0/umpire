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
  required: ['id', 'token', 'label', 'enabled', 'created_at'],
  properties: {
    id: { type: 'integer' },
    token: { type: 'string' },
    label: { type: 'string' },
    enabled: { type: 'integer', enum: [0, 1] },
    created_at: { type: 'string' },
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
  ]) {
    app.addSchema(schema)
  }

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'UMPIRE API',
        description:
          'Universal Monitoring Plugin & Incident Reporter — targets, groups, settings, FCM tokens, and status.',
        version: '1.0.0',
      },
      tags: [
        { name: 'health', description: 'Liveness' },
        { name: 'groups', description: 'Group trees and tags' },
        { name: 'targets', description: 'URLs to monitor' },
        { name: 'checks', description: 'Loaded check plugins' },
        { name: 'tokens', description: 'FCM device tokens' },
        { name: 'settings', description: 'Alert policy' },
        { name: 'status', description: 'Dashboard summary' },
        { name: 'schema', description: 'Core schema' },
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
