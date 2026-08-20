import tls from 'node:tls'
import {URL} from 'node:url'
import type {CheckContext, CheckOutcome, CheckPlugin} from '../../types.js'

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
    'Opens a TLS connection to HTTPS targets and fails if the handshake or certificate is invalid.',
  async check(ctx: CheckContext): Promise<CheckOutcome> {
    const startedAt = Date.now()
    let parsed: URL
    try {
      parsed = new URL(ctx.target.url)
    } catch {
      return fail(Date.now() - startedAt, 'invalid URL')
    }
    if (parsed.protocol !== 'https:') {
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
