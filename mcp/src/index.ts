import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {z} from 'zod'
import {UmpireClient, ApiError, loadConfig} from './client.js'
import {
  CORE_ROUTES,
  buildPath,
  catalogToRoutes,
  toolNameForRoute,
  type RouteDef,
} from './routes.js'

function jsonResult(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  }
}

function errorResult(err: unknown) {
  const message =
    err instanceof ApiError
      ? `HTTP ${err.status}: ${err.message}`
      : err instanceof Error
        ? err.message
        : String(err)
  return {
    isError: true as const,
    content: [{type: 'text' as const, text: message}],
  }
}

function routeInputSchema(route: RouteDef) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const param of route.pathParams) {
    shape[param] = z.union([z.string(), z.number()]).describe(`Path: ${param}`)
  }
  shape.query = z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe('Optional query string parameters')
  if (route.hasBody) {
    shape.body = z
      .unknown()
      .optional()
      .describe('JSON request body for write operations')
  }
  return shape
}

function registerRouteTool(
  server: McpServer,
  client: UmpireClient,
  route: RouteDef,
  usedNames: Set<string>,
): void {
  let name = toolNameForRoute(route.method, route.path)
  if (usedNames.has(name)) {
    let i = 2
    while (usedNames.has(`${name}_${i}`)) i += 1
    name = `${name}_${i}`.slice(0, 60)
  }
  usedNames.add(name)

  server.registerTool(
    name,
    {
      description: `${route.method} ${route.path} — ${route.description}`,
      inputSchema: routeInputSchema(route),
    },
    async args => {
      try {
        const input = args as Record<string, unknown>
        const pathParams: Record<string, string | number> = {}
        for (const param of route.pathParams) {
          const value = input[param]
          if (value == null) {
            throw new Error(`Missing path parameter: ${param}`)
          }
          pathParams[param] = value as string | number
        }
        const query = input.query as
          Record<string, string | number | boolean> | undefined
        const body = input.body
        const url = buildPath(route.path, pathParams, query)
        const data = await client.request(route.method, url, {body})
        return jsonResult({status: 200, body: data})
      } catch (err) {
        return errorResult(err)
      }
    },
  )
}

export async function createServer(client: UmpireClient): Promise<McpServer> {
  const server = new McpServer({
    name: 'umpire',
    version: '1.0.0',
  })

  server.registerTool(
    'umpire_request',
    {
      description:
        'Call any UMPIRE HTTP API route (core or plugin). Use umpire_list_routes to discover paths.',
      inputSchema: {
        method: z
          .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
          .describe('HTTP method'),
        path: z.string().describe('Absolute API path starting with /api/…'),
        query: z
          .record(z.union([z.string(), z.number(), z.boolean()]))
          .optional(),
        body: z.unknown().optional().describe('JSON body for write methods'),
      },
    },
    async args => {
      try {
        const {method, path, query, body} = args
        if (!path.startsWith('/api/')) {
          throw new Error('path must start with /api/')
        }
        const url = buildPath(path, {}, query)
        const data = await client.request(method, url, {body})
        return jsonResult({status: 200, body: data})
      } catch (err) {
        return errorResult(err)
      }
    },
  )

  server.registerTool(
    'umpire_list_routes',
    {
      description:
        'List available UMPIRE HTTP routes (core + loaded plugins). Each route may also be exposed as its own tool.',
      inputSchema: {},
    },
    async () => {
      try {
        const catalog = await client.listPluginCatalog()
        const pluginRoutes = catalogToRoutes(catalog)
        const routes = [...CORE_ROUTES, ...pluginRoutes].map(r => ({
          tool: toolNameForRoute(r.method, r.path),
          method: r.method,
          path: r.path,
          description: r.description,
          pathParams: r.pathParams,
          hasBody: r.hasBody,
        }))
        return jsonResult({routes})
      } catch (err) {
        return errorResult(err)
      }
    },
  )

  let pluginRoutes: RouteDef[] = []
  try {
    const catalog = await client.listPluginCatalog()
    pluginRoutes = catalogToRoutes(catalog)
  } catch {
    pluginRoutes = []
  }

  const usedNames = new Set<string>(['umpire_request', 'umpire_list_routes'])
  for (const route of [...CORE_ROUTES, ...pluginRoutes]) {
    registerRouteTool(server, client, route, usedNames)
  }

  return server
}

async function main(): Promise<void> {
  const {baseUrl, apiToken} = loadConfig()
  const client = new UmpireClient(baseUrl, apiToken)
  const server = await createServer(client)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
