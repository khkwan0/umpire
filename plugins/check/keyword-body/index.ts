import type {
  CheckContext,
  CheckOutcome,
  CheckPlugin,
  TargetCompatibility,
  TargetEvalParams,
} from '../../../api/src/plugins/types.js'
import {parseTargetAddress} from '../../../api/src/targetAddress.js'
import {resolveKeywordBodyConfig} from './config.js'
import {registerKeywordBodyCheckRoutes} from './routes.js'

function timeoutMs(): number {
  const n = Number(process.env.CHECK_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 10_000
}

export function evaluateKeywordBodyTarget(
  params: TargetEvalParams,
): TargetCompatibility {
  const parsed = parseTargetAddress(params.url)
  if (!parsed || !parsed.hasScheme) {
    return {ok: false, reason: 'requires an http:// or https:// URL'}
  }
  return {ok: true}
}

const keywordBodyCheck: CheckPlugin = {
  id: 'keyword-body',
  description:
    'Fetches the target URL and requires a configured keyword to appear in the response body.',

  evaluateTarget: evaluateKeywordBodyTarget,

  async registerRoutes(app) {
    await registerKeywordBodyCheckRoutes(app)
  },

  async check(ctx: CheckContext): Promise<CheckOutcome> {
    const cfg = resolveKeywordBodyConfig(ctx.config)
    const startedAt = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs())
    try {
      const res = await fetch(ctx.target.url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {'user-agent': 'umpire/1.0'},
      })
      const body = await res.text()
      const haystack = cfg.caseSensitive ? body : body.toLowerCase()
      const needle = cfg.caseSensitive ? cfg.keyword : cfg.keyword.toLowerCase()
      const ok = haystack.includes(needle)
      const latencyMs = Date.now() - startedAt
      return {
        ok,
        statusCode: res.status,
        error: ok ? null : `keyword "${cfg.keyword}" not found`,
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
  },
}

export default keywordBodyCheck
