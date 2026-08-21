import {execFile} from 'node:child_process'
import type {
  CheckContext,
  CheckOutcome,
  CheckPlugin,
  TargetCompatibility,
  TargetEvalParams,
} from '../../../api/src/plugins/types.js'
import {parseTargetAddress} from '../../../api/src/targetAddress.js'

export function evaluatePingTarget(
  params: TargetEvalParams,
): TargetCompatibility {
  if (!parseTargetAddress(params.url)) {
    return {ok: false, reason: 'invalid target address'}
  }
  return {ok: true}
}

function timeoutMs(): number {
  const n = Number(process.env.CHECK_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 10_000
}

function parseLatencyMs(output: string): number | null {
  const m = output.match(/time[=<]([0-9.]+)\s*ms/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function runPing(
  host: string,
  timeout: number,
): Promise<{ok: boolean; error: string | null; latencyMs: number | null}> {
  return new Promise(resolve => {
    execFile(
      'ping',
      ['-c', '1', '-W', String(Math.max(1, Math.ceil(timeout / 1000))), host],
      {timeout},
      (err, stdout, stderr) => {
        if (err) {
          const message = stderr?.trim() || err.message || 'ping failed'
          resolve({
            ok: false,
            error: message,
            latencyMs: parseLatencyMs(stdout),
          })
          return
        }
        resolve({ok: true, error: null, latencyMs: parseLatencyMs(stdout)})
      },
    )
  })
}

const pingCheck: CheckPlugin = {
  id: 'ping',
  description:
    'ICMP-pings the target hostname or IP and reports round-trip time.',
  evaluateTarget: evaluatePingTarget,
  async check(ctx: CheckContext): Promise<CheckOutcome> {
    const startedAt = Date.now()
    const parsed = parseTargetAddress(ctx.target.url)
    if (!parsed) {
      const latencyMs = Date.now() - startedAt
      return {
        ok: false,
        statusCode: null,
        error: 'invalid target address',
        latencyMs,
      }
    }
    const result = await runPing(parsed.hostname, timeoutMs())
    const latencyMs = result.latencyMs ?? Date.now() - startedAt
    return {
      ok: result.ok,
      statusCode: null,
      error: result.error,
      latencyMs,
    }
  },
}

export default pingCheck
