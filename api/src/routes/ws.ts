import type {
  FastifyInstance,
  FastifyRequest,
  LightMyRequestResponse,
} from 'fastify'
import type {WebSocket} from 'ws'
import {getAuthContext, type AuthRequest} from '../auth/index.js'

const ALLOWED_METHODS = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
])

type InjectMethod =
  'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'

const BLOCKED_PATHS = new Set(['/api/ws', '/api/stream'])

type WsRequestFrame = {
  id?: unknown
  method?: unknown
  path?: unknown
  query?: unknown
  headers?: unknown
  body?: unknown
}

type WsResponseFrame = {
  id: string
  status: number
  headers?: Record<string, string>
  body?: unknown
}

function requestPath(url: string): string {
  const q = url.indexOf('?')
  return q >= 0 ? url.slice(0, q) : url
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function buildUrl(path: string, query: unknown): string | {error: string} {
  if (typeof path !== 'string' || !path.startsWith('/api/')) {
    return {error: 'path must be an /api/… string'}
  }
  const pathname = requestPath(path)
  if (BLOCKED_PATHS.has(pathname) || pathname.startsWith('/api/ws/')) {
    return {error: 'path is not available over WebSocket'}
  }

  if (query == null) {
    return path.includes('?') ? path : pathname
  }

  if (typeof query === 'string') {
    const q = query.startsWith('?') ? query.slice(1) : query
    return q ? `${pathname}?${q}` : pathname
  }

  if (!isPlainObject(query)) {
    return {error: 'query must be an object or string'}
  }

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      return {error: `query.${key} must be a string, number, or boolean`}
    }
    params.append(key, String(value))
  }
  const encoded = params.toString()
  return encoded ? `${pathname}?${encoded}` : pathname
}

function normalizeHeaders(
  headers: unknown,
): Record<string, string> | {error: string} {
  if (headers == null) return {}
  if (!isPlainObject(headers)) {
    return {error: 'headers must be an object'}
  }
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== 'string') {
      return {error: `headers.${key} must be a string`}
    }
    const lower = key.toLowerCase()
    // Cookie is owned by the connection jar so auth stays consistent.
    if (lower === 'cookie' || lower === 'host' || lower === 'content-length') {
      continue
    }
    out[key] = value
  }
  return out
}

function applySetCookie(
  cookieHeader: string | undefined,
  setCookie: string | string[] | undefined,
): string | undefined {
  if (!setCookie) return cookieHeader
  const list = Array.isArray(setCookie) ? setCookie : [setCookie]
  const jar = new Map<string, string>()
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const eq = part.indexOf('=')
      if (eq <= 0) continue
      const name = part.slice(0, eq).trim()
      const value = part.slice(eq + 1).trim()
      if (name) jar.set(name, value)
    }
  }
  for (const entry of list) {
    const first = entry.split(';')[0] ?? ''
    const eq = first.indexOf('=')
    if (eq <= 0) continue
    const name = first.slice(0, eq).trim()
    const value = first.slice(eq + 1).trim()
    if (!name) continue
    if (value === '') jar.delete(name)
    else jar.set(name, value)
  }
  if (jar.size === 0) return undefined
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

function pickResponseHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const key of ['content-type', 'cache-control']) {
    const value = headers[key]
    if (value == null) continue
    out[key] = Array.isArray(value) ? value.join(', ') : value
  }
  const setCookie = headers['set-cookie']
  if (setCookie != null) {
    out['set-cookie'] = Array.isArray(setCookie)
      ? setCookie.join('\n')
      : setCookie
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function parseBody(payload: string, contentType: string | undefined): unknown {
  if (!payload) return undefined
  const ct = contentType ?? ''
  if (ct.includes('application/json')) {
    try {
      return JSON.parse(payload) as unknown
    } catch {
      return payload
    }
  }
  return payload
}

function sendJson(socket: WebSocket, frame: unknown): void {
  if (socket.readyState !== socket.OPEN) return
  socket.send(JSON.stringify(frame))
}

function sendResponse(socket: WebSocket, frame: WsResponseFrame): void {
  sendJson(socket, frame)
}

async function handleRpc(
  app: FastifyInstance,
  socket: WebSocket,
  req: FastifyRequest,
  cookieJar: {value: string | undefined},
  raw: string,
): Promise<void> {
  let parsed: WsRequestFrame
  try {
    parsed = JSON.parse(raw) as WsRequestFrame
  } catch {
    sendResponse(socket, {
      id: '',
      status: 400,
      body: {error: 'Invalid JSON frame'},
    })
    return
  }

  const id = typeof parsed.id === 'string' ? parsed.id : ''
  if (!id) {
    sendResponse(socket, {
      id: '',
      status: 400,
      body: {error: 'id must be a non-empty string'},
    })
    return
  }

  const methodRaw =
    typeof parsed.method === 'string' ? parsed.method.toUpperCase() : ''
  if (!ALLOWED_METHODS.has(methodRaw)) {
    sendResponse(socket, {
      id,
      status: 400,
      body: {error: 'method must be a supported HTTP verb'},
    })
    return
  }
  const method = methodRaw as InjectMethod

  if (typeof parsed.path !== 'string') {
    sendResponse(socket, {
      id,
      status: 400,
      body: {error: 'path must be an /api/… string'},
    })
    return
  }

  const url = buildUrl(parsed.path, parsed.query)
  if (typeof url !== 'string') {
    sendResponse(socket, {id, status: 400, body: {error: url.error}})
    return
  }

  const extraHeaders = normalizeHeaders(parsed.headers)
  if ('error' in extraHeaders) {
    sendResponse(socket, {id, status: 400, body: {error: extraHeaders.error}})
    return
  }

  const headers: Record<string, string> = {...extraHeaders}
  if (cookieJar.value) {
    headers.cookie = cookieJar.value
  }

  const hasBody =
    parsed.body !== undefined && method !== 'GET' && method !== 'HEAD'
  if (
    hasBody &&
    headers['content-type'] == null &&
    headers['Content-Type'] == null
  ) {
    headers['content-type'] = 'application/json'
  }

  try {
    const res: LightMyRequestResponse = await app.inject({
      method,
      url,
      headers,
      payload: hasBody ? (parsed.body as string | object | Buffer) : undefined,
      remoteAddress: req.ip,
    })

    cookieJar.value = applySetCookie(
      cookieJar.value,
      res.headers['set-cookie'] as string | string[] | undefined,
    )

    sendResponse(socket, {
      id,
      status: res.statusCode,
      headers: pickResponseHeaders(
        res.headers as Record<string, string | string[] | undefined>,
      ),
      body: parseBody(res.body, res.headers['content-type']),
    })
  } catch (err) {
    req.log.error({err}, 'websocket inject failed')
    sendResponse(socket, {
      id,
      status: 500,
      body: {error: 'Internal server error'},
    })
  }
}

export async function wsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/ws',
    {
      websocket: true,
      schema: {
        tags: ['system'],
        summary:
          'WebSocket HTTP bridge — JSON frames map to any /api route (including plugins)',
        hide: true,
      },
    },
    (socket, req) => {
      const cookieJar = {
        value:
          typeof req.headers.cookie === 'string'
            ? req.headers.cookie
            : undefined,
      }

      // Attach message handler before any async/deferred work so early
      // frames are not dropped; defer the hello so clients can subscribe.
      socket.on('message', message => {
        const raw =
          typeof message === 'string'
            ? message
            : Buffer.isBuffer(message)
              ? message.toString('utf8')
              : Array.isArray(message)
                ? Buffer.concat(message).toString('utf8')
                : Buffer.from(message as ArrayBuffer).toString('utf8')

        void handleRpc(app, socket, req, cookieJar, raw)
      })

      const auth = getAuthContext(req as AuthRequest)
      setImmediate(() => {
        sendJson(socket, {
          type: 'connected',
          auth: auth
            ? {
                kind: auth.kind,
                is_admin: auth.is_admin,
                can_write: auth.can_write,
                single_user_mode: auth.single_user_mode,
                username: auth.user?.username ?? null,
              }
            : null,
        })
      })
    },
  )
}
