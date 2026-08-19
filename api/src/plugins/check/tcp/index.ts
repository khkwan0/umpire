import net from 'node:net'
import { URL } from 'node:url'
import type { CheckOutcome, CheckPlugin } from '../../types.js'

function timeoutMs(): number {
  const n = Number(process.env.CHECK_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 10_000
}

function defaultPort(protocol: string): number {
  if (protocol === 'https:') return 443
  return 80
}

function fail(latencyMs: number, error: string): CheckOutcome {
  return { ok: false, statusCode: null, error, latencyMs }
}

const tcpCheck: CheckPlugin = {
  id: 'tcp',
  async check(url: string): Promise<CheckOutcome> {
    const startedAt = Date.now()
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return fail(Date.now() - startedAt, 'invalid URL')
    }
    const host = parsed.hostname
    const port = parsed.port ? Number(parsed.port) : defaultPort(parsed.protocol)
    const timeout = timeoutMs()

    return await new Promise<CheckOutcome>((resolve) => {
      const socket = net.createConnection({ host, port }, () => {
        const latencyMs = Date.now() - startedAt
        socket.end()
        resolve({ ok: true, statusCode: null, error: null, latencyMs })
      })
      socket.setTimeout(timeout, () => {
        const latencyMs = Date.now() - startedAt
        socket.destroy()
        resolve(fail(latencyMs, 'timeout'))
      })
      socket.once('error', (err) => {
        const latencyMs = Date.now() - startedAt
        resolve(fail(latencyMs, err.message))
      })
    })
  },
}

export default tcpCheck
