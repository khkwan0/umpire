import type { CheckOutcome, CheckPlugin } from '../../types.js'
import { readConfig } from './config.js'
import { registerHttpCheckRoutes } from './routes.js'

function timeoutMs(): number {
  const n = Number(process.env.CHECK_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 10_000
}

const httpCheck: CheckPlugin = {
  id: 'http',

  async registerRoutes(app) {
    await registerHttpCheckRoutes(app)
  },

  async check(url: string): Promise<CheckOutcome> {
    const config = readConfig()
    const startedAt = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs())
    try {
      const headers: Record<string, string> = {
        'user-agent': 'umpire/1.0',
        ...config.headers,
      }
      const useBody = !['GET', 'HEAD'].includes(config.method)
      const res = await fetch(url, {
        method: config.method,
        redirect: 'follow',
        signal: controller.signal,
        headers,
        body: useBody && config.body ? config.body : undefined,
      })
      const latencyMs = Date.now() - startedAt
      const ok = res.status === 200
      return {
        ok,
        statusCode: res.status,
        error: ok ? null : `HTTP ${res.status}`,
        latencyMs,
      }
    } catch (err) {
      const latencyMs = Date.now() - startedAt
      const message =
        err instanceof Error
          ? err.name === 'AbortError'
            ? 'timeout'
            : err.message
          : String(err)
      return { ok: false, statusCode: null, error: message, latencyMs }
    } finally {
      clearTimeout(timer)
    }
  },
}

export default httpCheck
