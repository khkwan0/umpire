import tls from 'node:tls'
import type {
  CheckContext,
  CheckOutcome,
  CheckPlugin,
  TargetCompatibility,
  TargetEvalParams,
} from '../../../api/src/plugins/types.js'
import {parseTargetAddress} from '../../../api/src/targetAddress.js'

export function evaluateTlsTarget(
  params: TargetEvalParams,
): TargetCompatibility {
  const parsed = parseTargetAddress(params.url)
  if (!parsed) {
    return {ok: false, reason: 'invalid target address'}
  }
  if (parsed.hasScheme && parsed.protocol !== 'https:') {
    return {ok: false, reason: 'requires https:// or a bare host'}
  }
  return {ok: true}
}

function timeoutMs(): number {
  const n = Number(process.env.CHECK_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 10_000
}

function fail(latencyMs: number, error: string): CheckOutcome {
  return {ok: false, statusCode: null, error, latencyMs}
}

const tlsCheck: CheckPlugin = {
  id: 'tls',
  description:
    'Opens a TLS connection to the target (https URL or bare host on 443) and fails if the handshake or certificate is invalid.',
  evaluateTarget: evaluateTlsTarget,
  async check(ctx: CheckContext): Promise<CheckOutcome> {
    const startedAt = Date.now()
    const parsed = parseTargetAddress(ctx.target.url)
    if (!parsed) {
      return fail(Date.now() - startedAt, 'invalid target address')
    }
    if (parsed.hasScheme && parsed.protocol !== 'https:') {
      return fail(Date.now() - startedAt, 'TLS check requires https URL')
    }

    const host = parsed.hostname
    const port = parsed.port ? Number(parsed.port) : 443
    const timeout = timeoutMs()

    return await new Promise<CheckOutcome>(resolve => {
      const socket = tls.connect(
        {
          host,
          port,
          servername: host,
          rejectUnauthorized: true,
        },
        () => {
          const latencyMs = Date.now() - startedAt
          socket.end()
          resolve({ok: true, statusCode: null, error: null, latencyMs})
        },
      )

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

export default tlsCheck
