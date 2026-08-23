export type HttpMethod =
  'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'

export interface RouteDef {
  method: HttpMethod
  path: string
  description: string
  /** Path segments like :id extracted from path */
  pathParams: string[]
  hasBody: boolean
}

export interface PluginCatalogEntry {
  id: string
  kind: 'check' | 'scheduler' | 'notify'
  routes: Array<{method: string; path: string}>
}

/** Core HTTP routes always available (plugin routes come from GET /api/plugins). */
export const CORE_ROUTES: RouteDef[] = [
  {
    method: 'GET',
    path: '/api/health',
    description: 'API liveness check',
    pathParams: [],
    hasBody: false,
  },
  {
    method: 'GET',
    path: '/api/auth/policy',
    description: 'Public auth policy',
    pathParams: [],
    hasBody: false,
  },
  {
    method: 'GET',
    path: '/api/auth/me',
    description: 'Current authenticated principal',
    pathParams: [],
    hasBody: false,
  },
  {
    method: 'GET',
    path: '/api/status',
    description: 'Dashboard status summary with per-target health',
    pathParams: [],
    hasBody: false,
  },
  {
    method: 'GET',
    path: '/api/incidents',
    description: 'Outage and recovery log',
    pathParams: [],
    hasBody: false,
  },
  {
    method: 'GET',
    path: '/api/targets',
    description: 'List monitoring targets',
    pathParams: [],
    hasBody: false,
  },
  {
    method: 'POST',
    path: '/api/targets',
    description: 'Create a monitoring target',
    pathParams: [],
    hasBody: true,
  },
  {
    method: 'GET',
    path: '/api/targets/:id',
    description: 'Get one target',
    pathParams: ['id'],
    hasBody: false,
  },
  {
    method: 'PATCH',
    path: '/api/targets/:id',
    description: 'Update a target',
    pathParams: ['id'],
    hasBody: true,
  },
  {
    method: 'DELETE',
    path: '/api/targets/:id',
    description: 'Delete a target',
    pathParams: ['id'],
    hasBody: false,
  },
  {
    method: 'GET',
    path: '/api/targets/:id/results',
    description: 'Recent check results for a target',
    pathParams: ['id'],
    hasBody: false,
  },
  {
    method: 'GET',
    path: '/api/groups',
    description: 'List groups (add ?tree=1 for nested tree)',
    pathParams: [],
    hasBody: false,
  },
  {
    method: 'POST',
    path: '/api/groups',
    description: 'Create a group',
    pathParams: [],
    hasBody: true,
  },
  {
    method: 'GET',
    path: '/api/settings',
    description: 'Get alert and auth settings',
    pathParams: [],
    hasBody: false,
  },
  {
    method: 'PUT',
    path: '/api/settings',
    description: 'Update settings (admin)',
    pathParams: [],
    hasBody: true,
  },
  {
    method: 'GET',
    path: '/api/checks',
    description: 'List loaded check plugins',
    pathParams: [],
    hasBody: false,
  },
  {
    method: 'GET',
    path: '/api/notifiers',
    description: 'List loaded notifier plugins',
    pathParams: [],
    hasBody: false,
  },
  {
    method: 'GET',
    path: '/api/plugins',
    description: 'Plugin catalog with namespaced HTTP routes',
    pathParams: [],
    hasBody: false,
  },
  {
    method: 'GET',
    path: '/api/plugin-manager',
    description: 'Runtime plugin enable/disable state',
    pathParams: [],
    hasBody: false,
  },
  {
    method: 'PUT',
    path: '/api/plugin-manager/:kind/:id',
    description: 'Enable or disable a loaded plugin',
    pathParams: ['kind', 'id'],
    hasBody: true,
  },
  {
    method: 'GET',
    path: '/api/users',
    description: 'List users (admin)',
    pathParams: [],
    hasBody: false,
  },
  {
    method: 'GET',
    path: '/api/roles',
    description: 'List roles (admin)',
    pathParams: [],
    hasBody: false,
  },
  {
    method: 'GET',
    path: '/api/tokens',
    description: 'List API tokens for agents',
    pathParams: [],
    hasBody: false,
  },
  {
    method: 'POST',
    path: '/api/tokens',
    description: 'Create an API token (secret returned once)',
    pathParams: [],
    hasBody: true,
  },
  {
    method: 'DELETE',
    path: '/api/tokens/:id',
    description: 'Revoke an API token',
    pathParams: ['id'],
    hasBody: false,
  },
  {
    method: 'GET',
    path: '/api/schema',
    description: 'Frozen core SQLite schema',
    pathParams: [],
    hasBody: false,
  },
]

export function pathParamsFromRoute(path: string): string[] {
  const params: string[] = []
  for (const part of path.split('/')) {
    if (part.startsWith(':')) params.push(part.slice(1))
  }
  return params
}

export function catalogToRoutes(catalog: PluginCatalogEntry[]): RouteDef[] {
  const routes: RouteDef[] = []
  for (const plugin of catalog) {
    for (const route of plugin.routes) {
      const method = route.method.toUpperCase() as HttpMethod
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) continue
      routes.push({
        method,
        path: route.path,
        description: `${plugin.kind}/${plugin.id} plugin route`,
        pathParams: pathParamsFromRoute(route.path),
        hasBody: method === 'POST' || method === 'PUT' || method === 'PATCH',
      })
    }
  }
  return routes
}

export function toolNameForRoute(method: string, path: string): string {
  const slug = path
    .replace(/^\/api\//, '')
    .replace(/[:/]/g, '_')
    .replace(/-/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  const name = `${method.toLowerCase()}_${slug}`
  return name.slice(0, 60)
}

export function buildPath(
  template: string,
  params: Record<string, string | number | undefined>,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  let path = template
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue
    path = path.replace(`:${key}`, encodeURIComponent(String(value)))
  }
  if (!query) return path
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue
    search.set(key, String(value))
  }
  const q = search.toString()
  return q ? `${path}?${q}` : path
}
