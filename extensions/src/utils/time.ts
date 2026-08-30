/** Parse SQLite `datetime('now')` (UTC, no suffix) and ISO timestamps. */
export function parseApiTimestamp(value: string): Date | null {
  const iso = value.includes('T') ? value : value.replace(' ', 'T')
  const withZone =
    /Z$/i.test(iso) || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`
  const ms = Date.parse(withZone)
  if (Number.isNaN(ms)) return null
  return new Date(ms)
}

export function formatTimeAgo(
  value: string | null | undefined,
  fallback = 'Never checked',
): string {
  if (value == null || value === '') return fallback
  const date = parseApiTimestamp(value)
  if (!date) return fallback

  const seconds = Math.round((date.getTime() - Date.now()) / 1000)
  const abs = Math.abs(seconds)
  const rtf = new Intl.RelativeTimeFormat(undefined, {numeric: 'auto'})

  if (abs < 60) return rtf.format(seconds, 'second')
  const minutes = Math.round(seconds / 60)
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute')
  const hours = Math.round(seconds / 3600)
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour')
  const days = Math.round(seconds / 86400)
  if (Math.abs(days) < 30) return rtf.format(days, 'day')
  const months = Math.round(seconds / (86400 * 30))
  if (Math.abs(months) < 12) return rtf.format(months, 'month')
  return rtf.format(Math.round(seconds / (86400 * 365)), 'year')
}

export function formatCheckedAgo(value: string | null | undefined): string {
  const ago = formatTimeAgo(value)
  return ago === 'Never checked' ? ago : `Checked ${ago}`
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
