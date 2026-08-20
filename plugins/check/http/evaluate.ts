import type {CheckOutcome} from '../../../api/src/plugins/types.js'
import type {HttpCheckConfig} from './config.js'

function timeoutMs(): number {
  const n = Number(process.env.CHECK_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 10_000
}

function statusInAcceptedRanges(
  statusCode: number,
  acceptedRanges: HttpCheckConfig['acceptedStatusRanges'],
): boolean {
  if (acceptedRanges.length === 0) return false
  const bucket = `${Math.floor(statusCode / 100)}xx`
  return acceptedRanges.includes(
    bucket as HttpCheckConfig['acceptedStatusRanges'][number],
  )
}

function statusAccepted(statusCode: number, config: HttpCheckConfig): boolean {
  if (config.acceptedStatusCodes.includes(statusCode)) return true
  return statusInAcceptedRanges(statusCode, config.acceptedStatusRanges)
}

function formatAcceptedStatus(config: HttpCheckConfig): string {
  const parts: string[] = []
  if (config.acceptedStatusRanges.length > 0) {
    parts.push(`ranges: ${config.acceptedStatusRanges.join(', ')}`)
  }
  if (config.acceptedStatusCodes.length > 0) {
    parts.push(`codes: ${config.acceptedStatusCodes.join(', ')}`)
  }
  return parts.join('; ')
}

function evaluateOutcome(
  statusCode: number,
  latencyMs: number,
  config: HttpCheckConfig,
): Pick<CheckOutcome, 'ok' | 'error'> {
  const statusOk = statusAccepted(statusCode, config)
  if (!statusOk) {
    return {
      ok: false,
      error: `HTTP ${statusCode} outside accepted status (${formatAcceptedStatus(config)})`,
    }
  }
  if (config.maxLatencyMs != null && latencyMs > config.maxLatencyMs) {
    return {
      ok: false,
      error: `latency ${Math.round(latencyMs)}ms exceeds ${config.maxLatencyMs}ms`,
    }
  }
  return {ok: true, error: null}
}

export async function runHttpCheck(
  url: string,
  config: HttpCheckConfig,
): Promise<CheckOutcome> {
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
    const {ok, error} = evaluateOutcome(res.status, latencyMs, config)
    return {
      ok,
      statusCode: res.status,
      error,
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
    return {ok: false, statusCode: null, error: message, latencyMs}
  } finally {
    clearTimeout(timer)
  }
}
