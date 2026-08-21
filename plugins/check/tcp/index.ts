import net from 'node:net'
import type {
  CheckContext,
  CheckOutcome,
  CheckPlugin,
  TargetCompatibility,
  TargetEvalParams,
} from '../../../api/src/plugins/types.js'
import {parseTargetAddress} from '../../../api/src/targetAddress.js'

export function evaluateTcpTarget(
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

function defaultPort(protocol: string, hasScheme: boolean): number {
  if (protocol === 'https:') return 443
  if (protocol === 'http:' || !hasScheme) return 80
  return 80
}

function fail(latencyMs: number, error: string): CheckOutcome {
  return {ok: false, statusCode: null, error, latencyMs}
}

const tcpCheck: CheckPlugin = {
  id: 'tcp',
  description:
    'Opens a TCP connection to the target host and port (URL, hostname, or IP).',
  evaluateTarget: evaluateTcpTarget,
  async check(ctx: CheckContext): Promise<CheckOutcome> {
    const startedAt = Date.now()
    const parsed = parseTargetAddress(ctx.target.url)
    if (!parsed) {
      return fail(Date.now() - startedAt, 'invalid target address')
    }
    const host = parsed.hostname
    const port = parsed.port
      ? Number(parsed.port)
      : defaultPort(parsed.protocol, parsed.hasScheme)
    const timeout = timeoutMs()

    return await new Promise<CheckOutcome>(resolve => {
      const socket = net.createConnection({host, port}, () => {
        const latencyMs = Date.now() - startedAt
        socket.end()
        resolve({ok: true, statusCode: null, error: null, latencyMs})
      })
      socket.setTimeout(timeout, () => {
        const latencyMs = Date.now() - startedAt
        socket.destroy()
        resolve(fail(latencyMs, 'timeout'))
      })
      socket.once('error', err => {
        const latencyMs = Date.now() - startedAt
        resolve(fail(latencyMs, err.message))
      })
    })
  },
}

export default tcpCheck
