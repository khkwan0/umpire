export interface AuthPolicy {
  auth_enabled: boolean
  allow_readonly_without_auth: boolean
  login_required: boolean
  user_count: number
}

export interface AuthPrincipal {
  kind: 'anonymous' | 'user'
  user: {id: number; username: string} | null
  is_admin: boolean
  can_write: boolean
  single_user_mode: boolean
}

export interface StatusTarget {
  id: number
  url: string
  interval_seconds: number
  enabled: number
  group_id: number | null
  group_tag?: string | null
  /** 1=up, 0=down, 2=partial, null=never checked */
  is_up: number | null
  last_checked_at: string | null
  last_status_code: number | null
  last_error: string | null
  last_latency_ms: number | null
}

export interface StatusResponse {
  targets: StatusTarget[]
}

export interface Incident {
  id: number
  target_id: number
  url: string
  group_tag: string | null
  status: 'down' | 'partial'
  recovered: number
  started_at: string
  recovered_at: string | null
  duration_seconds: number | null
  error: string | null
  status_code: number | null
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

/** Follow redirects (e.g. http→https) and return the canonical base URL. */
export async function canonicalizeBaseUrl(baseUrl: string): Promise<string> {
  const candidates = [baseUrl]
  try {
    const u = new URL(baseUrl)
    if (u.protocol === 'http:') {
      candidates.push(baseUrl.replace(/^http:/i, 'https:'))
    }
  } catch {
    return baseUrl
  }

  for (const candidate of candidates) {
    try {
      const res = await fetch(joinUrl(candidate, '/api/health'), {
        credentials: 'include',
        redirect: 'follow',
      })
      if (!res.ok) continue
      const final = new URL(res.url)
      const basePath = final.pathname.replace(/\/api\/health\/?$/, '') || ''
      return `${final.origin}${basePath}`.replace(/\/+$/, '')
    } catch {
      continue
    }
  }
  return baseUrl
}

export async function apiRequest<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  let res: Response
  try {
    res = await fetch(joinUrl(baseUrl, path), {
      ...init,
      headers,
      credentials: 'include',
    })
  } catch (err) {
    throw new ApiError(
      0,
      err instanceof Error ? err.message : 'Network request failed',
    )
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  let body: unknown = undefined
  if (text) {
    try {
      body = JSON.parse(text) as unknown
    } catch {
      body = text
    }
  }

  if (!res.ok) {
    const message =
      body &&
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as {error: unknown}).error === 'string'
        ? (body as {error: string}).error
        : res.statusText || `HTTP ${res.status}`
    throw new ApiError(res.status, message)
  }

  return body as T
}

export const api = {
  policy: (baseUrl: string) =>
    apiRequest<AuthPolicy>(baseUrl, '/api/auth/policy'),
  me: (baseUrl: string) =>
    apiRequest<{principal: AuthPrincipal}>(baseUrl, '/api/auth/me'),
  login: (baseUrl: string, username: string, password: string) =>
    apiRequest<{principal: AuthPrincipal}>(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({username, password}),
    }),
  logout: (baseUrl: string) =>
    apiRequest<{ok: boolean}>(baseUrl, '/api/auth/logout', {method: 'POST'}),
  status: (baseUrl: string) =>
    apiRequest<StatusResponse>(baseUrl, '/api/status'),
  incidents: (baseUrl: string, limit = 20) =>
    apiRequest<Incident[]>(baseUrl, `/api/incidents?limit=${limit}`),
  health: (baseUrl: string) =>
    apiRequest<{ok: boolean}>(baseUrl, '/api/health'),
}

export function streamUrl(baseUrl: string): string {
  return joinUrl(baseUrl, '/api/stream')
}
