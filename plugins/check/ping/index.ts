import {execFile} from 'node:child_process'
import {URL} from 'node:url'
import type {
  CheckContext,
  CheckOutcome,
  CheckPlugin,
} from '../../../api/src/plugins/types.js'

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
  description: 'ICMP-pings the target hostname and reports round-trip time.',
  async check(ctx: CheckContext): Promise<CheckOutcome> {
    const startedAt = Date.now()
    let parsed: URL
    try {
      parsed = new URL(ctx.target.url)
    } catch {
      const latencyMs = Date.now() - startedAt
      return {ok: false, statusCode: null, error: 'invalid URL', latencyMs}
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
