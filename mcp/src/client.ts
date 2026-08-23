import type {HttpMethod} from './routes.js'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class UmpireClient {
  constructor(
    readonly baseUrl: string,
    private readonly apiToken?: string,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  private headers(extra?: HeadersInit): Headers {
    const headers = new Headers(extra)
    if (!headers.has('accept')) headers.set('accept', 'application/json')
    if (this.apiToken) {
      headers.set('authorization', `Bearer ${this.apiToken}`)
    }
    return headers
  }

  async request<T = unknown>(
    method: HttpMethod | string,
    path: string,
    init?: {body?: unknown; headers?: HeadersInit},
  ): Promise<T> {
    const headers = this.headers(init?.headers)
    const upper = method.toUpperCase()
    const hasBody =
      init?.body !== undefined &&
      upper !== 'GET' &&
      upper !== 'HEAD' &&
      upper !== 'OPTIONS'

    if (hasBody && !headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }

    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: upper,
        headers,
        body: hasBody ? JSON.stringify(init!.body) : undefined,
      })
    } catch (err) {
      throw new ApiError(
        0,
        err instanceof Error ? err.message : 'Network request failed',
      )
    }

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

  async listPluginCatalog() {
    return this.request<
      Array<{
        id: string
        kind: 'check' | 'scheduler' | 'notify'
        routes: Array<{method: string; path: string}>
      }>
    >('GET', '/api/plugins')
  }
}

export function loadConfig(): {baseUrl: string; apiToken?: string} {
  const baseUrl = (
    process.env.UMPIRE_BASE_URL ??
    process.env.UMPIRE_URL ??
    'http://localhost:8089'
  ).trim()
  const apiToken = (
    process.env.UMPIRE_API_TOKEN ??
    process.env.UMPIRE_TOKEN ??
    ''
  ).trim()
  return {baseUrl, apiToken: apiToken || undefined}
}
