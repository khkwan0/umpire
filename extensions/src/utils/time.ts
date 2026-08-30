/** Parse SQLite `datetime('now')` (UTC, no suffix) and ISO timestamps. */
export function parseApiTimestamp(value: string): Date | null {
  const iso = value.includes('T') ? value : value.replace(' ', 'T')
  const withZone =
    /Z$/i.test(iso) || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`
  const ms = Date.parse(withZone)
  if (Number.isNaN(ms)) return null
  return new Date(ms)
}

export function formatCompactAgo(
  value: string | null | undefined,
  fallback = '—',
): string {
  if (value == null || value === '') return fallback
  const date = parseApiTimestamp(value)
  if (!date) return fallback

  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(seconds / 3600)
  if (hours < 24) return `${hours}h`
  return `${Math.round(seconds / 86400)}d`
}

export function formatTimestampTooltip(
  value: string | null | undefined,
): string | undefined {
  if (value == null || value === '') return undefined
  const date = parseApiTimestamp(value)
  if (!date) return undefined
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}
