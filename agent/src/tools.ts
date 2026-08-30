import {mergeListedRoutes} from './routes.js'
import type {LlmToolDef, UmpireCaller} from './types.js'

export const AGENT_TOOLS: LlmToolDef[] = [
  {
    name: 'get_monitoring_status',
    description:
      'Get current dashboard status: per-target health (up/down/partial), last check times, errors.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'list_incidents',
    description: 'List recent outage and recovery incidents (newest first).',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Max incidents to return (default 20, max 200)',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_targets',
    description: 'List all monitoring targets with configuration.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'update_target',
    description:
      'Update a target. Pause with enabled=false, resume with enabled=true. Same as PATCH /api/targets/:id.',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: {
        id: {type: 'integer', description: 'Target id'},
        enabled: {
          type: 'boolean',
          description: 'false pauses checks; true resumes',
        },
        url: {type: 'string', description: 'New target address'},
        interval_seconds: {type: 'integer', description: 'Check interval'},
        group_id: {
          type: ['integer', 'null'],
          description: 'Group id, or null to ungroup',
        },
        check_ids: {
          type: 'array',
          items: {type: 'string'},
          description: 'Check plugin ids (empty = all loaded checks)',
        },
        notifier_ids: {
          type: 'array',
          items: {type: 'string'},
          description: 'Notifier plugin ids (empty = all loaded notifiers)',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_groups',
    description: 'List target groups. Use query tree=1 for nested tree.',
    parameters: {
      type: 'object',
      properties: {
        tree: {type: 'boolean', description: 'Return nested tree when true'},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_api_routes',
    description:
      'List compact HTTP routes (method, path, description) for core APIs plus loaded plugins. Call this before umpire_api_request when no named tool matches. Do not use GET /api/schema or OpenAPI for discovery.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'umpire_api_request',
    description:
      'Call any UMPIRE HTTP API route (core or plugin). Path must start with /api/. If unsure of the path, call list_api_routes first. Use for create/delete, results, settings, users, plugin config, etc.',
    parameters: {
      type: 'object',
      required: ['method', 'path'],
      properties: {
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        },
        path: {
          type: 'string',
          description: 'e.g. /api/plugins/notify/slack/config',
        },
        query: {
          type: 'object',
          additionalProperties: true,
          description: 'Optional query parameters',
        },
        body: {description: 'JSON body for write methods'},
      },
      additionalProperties: false,
    },
  },
]

function summarizeResult(data: unknown, maxLen = 4000): string {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen)}\n… (truncated)`
}

export async function executeAgentTool(
  call: UmpireCaller,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case 'get_monitoring_status':
      return summarizeResult(await call('GET', '/api/status'))
    case 'list_incidents': {
      const limit = Math.min(200, Math.max(1, Number(args.limit) || 20))
      return summarizeResult(
        await call('GET', '/api/incidents', {query: {limit}}),
      )
    }
    case 'list_targets':
      return summarizeResult(await call('GET', '/api/targets'))
    case 'update_target': {
      const id = Number(args.id)
      if (!Number.isInteger(id) || id < 1) {
        throw new Error('id must be a target id')
      }
      const body: Record<string, unknown> = {}
      if (args.enabled !== undefined) body.enabled = Boolean(args.enabled)
      if (args.url !== undefined) body.url = String(args.url)
      if (args.interval_seconds !== undefined) {
        body.interval_seconds = Number(args.interval_seconds)
      }
      if (args.group_id !== undefined) {
        body.group_id = args.group_id === null ? null : Number(args.group_id)
      }
      if (args.check_ids !== undefined) body.check_ids = args.check_ids
      if (args.notifier_ids !== undefined) {
        body.notifier_ids = args.notifier_ids
      }
      if (Object.keys(body).length === 0) {
        throw new Error('provide at least one field to update (e.g. enabled)')
      }
      return summarizeResult(await call('PATCH', `/api/targets/${id}`, {body}))
    }
    case 'list_groups': {
      const tree = args.tree === true
      return summarizeResult(
        await call('GET', '/api/groups', {
          query: tree ? {tree: 1} : {},
        }),
      )
    }
    case 'list_api_routes': {
      let catalog: unknown = []
      let plugin_catalog_error: string | undefined
      try {
        catalog = await call('GET', '/api/plugins')
      } catch (err) {
        plugin_catalog_error = err instanceof Error ? err.message : String(err)
      }
      return summarizeResult(
        {
          routes: mergeListedRoutes(catalog),
          ...(plugin_catalog_error ? {plugin_catalog_error} : {}),
        },
        16000,
      )
    }
    case 'umpire_api_request': {
      const method = String(args.method ?? 'GET').toUpperCase()
      const path = String(args.path ?? '')
      if (!path.startsWith('/api/')) {
        throw new Error('path must start with /api/')
      }
      if (path.startsWith('/api/agent/')) {
        throw new Error('agent routes cannot be called via tools')
      }
      const query = args.query as
        Record<string, string | number | boolean> | undefined
      return summarizeResult(await call(method, path, {query, body: args.body}))
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

export const DEFAULT_SYSTEM_PROMPT = `You are the UMPIRE monitoring assistant. UMPIRE watches HTTP/network targets, records check results, tracks incidents, and sends alerts through notifier plugins.

Help operators understand target health, investigate outages, and manage monitoring configuration. Always use tools to fetch live data before answering factual questions about current status. Be concise and actionable.

Named tools: get_monitoring_status, list_incidents, list_targets, update_target, list_groups, list_api_routes, umpire_api_request. You do not have MCP-generated tools such as patch_targets_id.

Pause a target with update_target (id, enabled=false) and resume with enabled=true. That is PATCH /api/targets/:id.

If there is no named tool for the request, call list_api_routes then umpire_api_request with the matching method and path. Replace :id and other path params with real values. Do not use GET /api/schema or OpenAPI to discover routes.

Examples:
- Create a target: POST /api/targets
- Delete a target: DELETE /api/targets/:id
- Recent check results: GET /api/targets/:id/results
- Settings, users, roles, tokens, plugin-manager: see list_api_routes
- Plugin config/test routes: /api/plugins/<kind>/<id>/… from list_api_routes

When suggesting changes (create target, delete target, update settings), confirm destructive actions clearly. Pausing or resuming is a normal write — do it when asked. Respect the user's permissions — if a tool returns 403, explain that their account lacks access.`
