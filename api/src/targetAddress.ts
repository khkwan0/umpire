/** Parsed target address: http(s) URL or bare hostname / IP (optional :port). */
export type ParsedTargetAddress = {
  hostname: string
  /** Empty string when the input omitted an explicit port. */
  port: string
  /** `http:` / `https:` when a scheme was given; empty for bare host/IP. */
  protocol: string
  hasScheme: boolean
}

/**
 * Accepts `https://example.com`, `http://10.0.0.5:8080`, or bare
 * `example.com` / `10.0.0.5` / `10.0.0.5:8080` (no path/query).
 */
export function parseTargetAddress(raw: string): ParsedTargetAddress | null {
  const s = raw.trim()
  if (!s) return null

  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname) return null
    return {
      hostname: u.hostname,
      port: u.port,
      protocol: u.protocol,
      hasScheme: true,
    }
  } catch {
    // fall through — may be a bare host
  }

  if (s.includes('://') || /\s/.test(s)) return null

  try {
    const u = new URL(`http://${s}`)
    if (!u.hostname) return null
    if (u.pathname !== '/' || u.search || u.hash) return null
    return {
      hostname: u.hostname,
      port: u.port,
      protocol: '',
      hasScheme: false,
    }
  } catch {
    return null
  }
}

export function isValidTargetAddress(raw: string): boolean {
  return parseTargetAddress(raw) !== null
}
