/**
 * Compact HTTP route catalog for the web agent (analog of MCP `umpire_list_routes`).
 *
 * Keep CORE_ROUTES in sync with mcp/src/routes.ts. Do not fetch OpenAPI or
 * GET /api/schema to build this list — plugin routes come from GET /api/plugins
 * at call time.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ListedRoute {
  method: HttpMethod
  path: string
  description: string
}

const HTTP_METHODS = new Set<string>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

/** Core HTTP routes always available (plugin routes come from GET /api/plugins). */
export const CORE_ROUTES: ListedRoute[] = [
  {method: 'GET', path: '/api/health', description: 'API liveness check'},
  {method: 'GET', path: '/api/auth/policy', description: 'Public auth policy'},
  {
    method: 'GET',
    path: '/api/auth/me',
    description: 'Current authenticated principal',
  },
  {
    method: 'GET',
    path: '/api/status',
    description: 'Dashboard status summary with per-target health',
  },
  {
    method: 'GET',
    path: '/api/incidents',
    description: 'Outage and recovery log',
  },
  {method: 'GET', path: '/api/targets', description: 'List monitoring targets'},
  {
    method: 'POST',
    path: '/api/targets',
    description: 'Create a monitoring target',
  },
  {method: 'GET', path: '/api/targets/:id', description: 'Get one target'},
  {method: 'PATCH', path: '/api/targets/:id', description: 'Update a target'},
  {method: 'DELETE', path: '/api/targets/:id', description: 'Delete a target'},
  {
    method: 'GET',
    path: '/api/targets/:id/results',
    description: 'Recent check results for a target',
  },
  {
    method: 'GET',
    path: '/api/groups',
    description: 'List groups (add ?tree=1 for nested tree)',
  },
  {method: 'POST', path: '/api/groups', description: 'Create a group'},
  {
    method: 'GET',
    path: '/api/settings',
    description: 'Get alert and auth settings',
  },
  {
    method: 'PUT',
    path: '/api/settings',
    description: 'Update settings (admin)',
  },
  {
    method: 'GET',
    path: '/api/checks',
    description: 'List loaded check plugins',
  },
  {
    method: 'GET',
    path: '/api/notifiers',
    description: 'List loaded notifier plugins',
  },
  {
    method: 'GET',
    path: '/api/plugins',
    description: 'Plugin catalog with namespaced HTTP routes',
  },
  {
    method: 'GET',
    path: '/api/plugin-manager',
    description: 'Runtime plugin enable/disable state',
  },
  {
    method: 'PUT',
    path: '/api/plugin-manager/:kind/:id',
    description: 'Enable or disable a loaded plugin',
  },
  {method: 'GET', path: '/api/users', description: 'List users (admin)'},
  {method: 'GET', path: '/api/roles', description: 'List roles (admin)'},
  {
    method: 'GET',
    path: '/api/tokens',
    description: 'List API tokens for agents',
  },
  {
    method: 'POST',
    path: '/api/tokens',
    description: 'Create an API token (secret returned once)',
  },
  {
    method: 'DELETE',
    path: '/api/tokens/:id',
    description: 'Revoke an API token',
  },
]

function isHttpMethod(value: string): value is HttpMethod {
  return HTTP_METHODS.has(value)
}

export function isAgentBlockedPath(path: string): boolean {
  return path.startsWith('/api/agent/')
}

export function listedRoutesFromCatalog(catalog: unknown): ListedRoute[] {
  if (!Array.isArray(catalog)) return []
  const routes: ListedRoute[] = []
  for (const plugin of catalog) {
    if (!plugin || typeof plugin !== 'object') continue
    const rec = plugin as {id?: unknown; kind?: unknown; routes?: unknown}
    const id = typeof rec.id === 'string' ? rec.id : ''
    const kind = typeof rec.kind === 'string' ? rec.kind : 'plugin'
    if (!Array.isArray(rec.routes)) continue
    for (const route of rec.routes) {
      if (!route || typeof route !== 'object') continue
      const raw = route as {method?: unknown; path?: unknown}
      const method = String(raw.method ?? '').toUpperCase()
      const path = String(raw.path ?? '')
      if (!isHttpMethod(method) || !path.startsWith('/api/')) continue
      if (isAgentBlockedPath(path)) continue
      routes.push({
        method,
        path,
        description: id ? `${kind}/${id} plugin route` : `${kind} plugin route`,
      })
    }
  }
  return routes
}

/** Core + plugin routes as compact `{method, path, description}` rows. */
export function mergeListedRoutes(catalog: unknown): ListedRoute[] {
  const seen = new Set<string>()
  const out: ListedRoute[] = []
  for (const route of [...CORE_ROUTES, ...listedRoutesFromCatalog(catalog)]) {
    if (isAgentBlockedPath(route.path)) continue
    const key = `${route.method} ${route.path}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(route)
  }
  return out
}
