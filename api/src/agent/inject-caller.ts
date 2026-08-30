import type {
  FastifyInstance,
  FastifyRequest,
  LightMyRequestResponse,
} from 'fastify'
import type {UmpireCaller} from 'umpire-agent'

export function headerValue(
  raw: string | string[] | undefined,
  join = '; ',
): string | undefined {
  if (typeof raw === 'string' && raw.trim()) return raw
  if (Array.isArray(raw) && raw.length > 0) return raw.join(join)
  return undefined
}

export function injectPayload(body: unknown): object | string | undefined {
  if (body === undefined) return undefined
  if (typeof body === 'string') {
    const trimmed = body.trim()
    if (!trimmed) return undefined
    try {
      return JSON.parse(trimmed) as object
    } catch {
      return body
    }
  }
  return body as object
}

export function injectAuthFromRequest(req: FastifyRequest): {
  cookie?: string
  authorization?: string
} {
  return {
    cookie: headerValue(req.headers.cookie),
    authorization: headerValue(req.headers.authorization, ', '),
  }
}

export function createInjectCaller(
  app: FastifyInstance,
  auth: {cookie?: string; authorization?: string},
): UmpireCaller {
  return async (method, path, opts) => {
    const url = buildInjectUrl(path, opts?.query)
    const upper = method.toUpperCase()
    const hasBody =
      opts?.body !== undefined && upper !== 'GET' && upper !== 'HEAD'
    const payload = hasBody ? injectPayload(opts?.body) : undefined
    const headers: Record<string, string> = {}
    if (auth.cookie) headers.cookie = auth.cookie
    if (auth.authorization) headers.authorization = auth.authorization
    if (payload !== undefined) {
      headers['content-type'] = 'application/json'
    }
    const res = (await app.inject({
      method: upper as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      url,
      headers,
      payload,
    })) as LightMyRequestResponse
    let body: unknown = res.body
    if (res.headers['content-type']?.includes('application/json') && res.body) {
      try {
        body = JSON.parse(res.body)
      } catch {
        body = res.body
      }
    }
    if (res.statusCode >= 400) {
      const errMsg =
        body &&
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof (body as {error: unknown}).error === 'string'
          ? (body as {error: string}).error
          : `HTTP ${res.statusCode}`
      throw new Error(errMsg)
    }
    return body
  }
}

function buildInjectUrl(
  path: string,
  query?: Record<string, string | number | boolean>,
): string {
  if (!query || Object.keys(query).length === 0) return path
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    params.set(k, String(v))
  }
  const q = params.toString()
  return q ? `${path}?${q}` : path
}
