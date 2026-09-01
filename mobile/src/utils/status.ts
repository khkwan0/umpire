export function statusLabel(
  isUp: number | null,
  enabled: number,
): 'paused' | 'pending' | 'up' | 'partial' | 'down' {
  if (!enabled) return 'paused'
  if (isUp === null) return 'pending'
  if (isUp === 1) return 'up'
  if (isUp === 2) return 'partial'
  return 'down'
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem ? `${hours}h ${rem}m` : `${hours}h`
}

export function formatTimestamp(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}
