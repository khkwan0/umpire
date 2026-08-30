/** Public URL prefix when UMPIRE is served under a subdirectory (must match web `BASE_PATH`). */
export function publicUrlPrefix(): string {
  const raw = (process.env.BASE_PATH ?? '/').trim() || '/'
  if (raw === '/') return ''
  const withLead = raw.startsWith('/') ? raw : `/${raw}`
  const trimmed = withLead.replace(/\/+$/, '')
  if (!/^\/[A-Za-z0-9/_-]+$/.test(trimmed)) {
    throw new Error(`Invalid BASE_PATH "${raw}". Use a simple path like /umpire.`)
  }
  return trimmed
}

function headerValue(
  value: string | string[] | undefined,
): string | undefined {
  if (value == null) return undefined
  const raw = Array.isArray(value) ? value[0] : value
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Public path prefix for the current request. Prefers `X-Forwarded-Prefix`
 * (set by nginx when the app is behind path-based routing) and falls back to
 * `BASE_PATH`. Supports both proxy styles:
 * - preserve path: browser `/umpire/documentation/` → upstream `/umpire/documentation/`
 * - strip path: browser `/umpire/documentation/` → upstream `/documentation/`
 */
export function requestPublicPrefix(req: {
  headers: Record<string, string | string[] | undefined>
}): string {
  const forwarded = headerValue(req.headers['x-forwarded-prefix'])
  if (forwarded) {
    const trimmed = forwarded.replace(/\/+$/, '')
    if (/^\/[A-Za-z0-9/_-]+$/.test(trimmed)) return trimmed
  }
  return publicUrlPrefix()
}
