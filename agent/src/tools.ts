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
    name: 'umpire_api_request',
    description:
      'Call any UMPIRE HTTP API route (core or plugin). Path must start with /api/. Use for plugin routes, settings, users, etc.',
    parameters: {
      type: 'object',
      required: ['method', 'path'],
      properties: {
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        },
        path: {type: 'string', description: 'e.g. /api/plugins/notify/slack/config'},
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
  const text =
    typeof data === 'string' ? data : JSON.stringify(data, null, 2)
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
    case 'list_groups': {
      const tree = args.tree === true
      return summarizeResult(
        await call('GET', '/api/groups', {
          query: tree ? {tree: 1} : {},
        }),
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
        | Record<string, string | number | boolean>
        | undefined
      return summarizeResult(
        await call(method, path, {query, body: args.body}),
      )
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

export const DEFAULT_SYSTEM_PROMPT = `You are the UMPIRE monitoring assistant. UMPIRE watches HTTP/network targets, records check results, tracks incidents, and sends alerts through notifier plugins.

Help operators understand target health, investigate outages, and manage monitoring configuration. Always use tools to fetch live data before answering factual questions about current status. Be concise and actionable.

When suggesting changes (create target, update settings), confirm destructive actions clearly. Respect the user's permissions — if a tool returns 403, explain that their account lacks access.`
