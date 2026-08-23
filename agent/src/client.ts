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

  async request<T = unknown>(
    method: string,
    path: string,
    opts?: {
      query?: Record<string, string | number | boolean>
      body?: unknown
    },
  ): Promise<T> {
    let url = path.startsWith('/') ? `${this.baseUrl}${path}` : path
    if (opts?.query) {
      const params = new URLSearchParams()
      for (const [k, v] of Object.entries(opts.query)) {
        params.set(k, String(v))
      }
      const q = params.toString()
      if (q) url += (url.includes('?') ? '&' : '?') + q
    }

    const headers: Record<string, string> = {accept: 'application/json'}
    if (this.apiToken) headers.authorization = `Bearer ${this.apiToken}`
    const upper = method.toUpperCase()
    const hasBody =
      opts?.body !== undefined && upper !== 'GET' && upper !== 'HEAD'
    if (hasBody) headers['content-type'] = 'application/json'

    let res: Response
    try {
      res = await fetch(url, {
        method: upper,
        headers,
        body: hasBody ? JSON.stringify(opts!.body) : undefined,
      })
    } catch (err) {
      throw new ApiError(
        0,
        err instanceof Error ? err.message : 'Network request failed',
      )
    }

    const text = await res.text()
    let body: unknown = text
    if (text) {
      try {
        body = JSON.parse(text) as unknown
      } catch {
        // keep text
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

  asCaller() {
    return (method: string, path: string, opts?: Parameters<UmpireClient['request']>[2]) =>
      this.request(method, path, opts)
  }
}

export function loadUmpireConfig(): {baseUrl: string; apiToken?: string} {
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
