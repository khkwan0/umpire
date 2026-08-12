import type { CheckOutcome, CheckPlugin } from '../types.js'

function timeoutMs(): number {
  const n = Number(process.env.CHECK_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 10_000
}

export function createHttpCheck(): CheckPlugin {
  return {
    id: 'http',

    async check(url: string): Promise<CheckOutcome> {
      const startedAt = Date.now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs())
      try {
        const res = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: { 'user-agent': 'yet-another-monitoring-tool/1.0' },
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
}
