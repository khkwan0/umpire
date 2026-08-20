import {healthFromDb, type HealthStatus} from './plugins/types.js'

export interface IncidentSourceRow {
  id: number
  target_id: number
  url: string
  group_tag: string | null
  ok: number
  status_code: number | null
  error: string | null
  checked_at: string
}

/** One outage window: starts on the first non-up check after up (or the first check). */
export interface Incident {
  id: number
  target_id: number
  url: string
  group_tag: string | null
  /** Most severe status seen while the target was down. */
  status: 'down' | 'partial'
  recovered: boolean
  started_at: string
  recovered_at: string | null
  duration_seconds: number | null
  error: string | null
  status_code: number | null
}

function isUnhealthy(
  status: HealthStatus | null,
): status is 'down' | 'partial' {
  return status === 'down' || status === 'partial'
}

function worseStatus(
  current: 'down' | 'partial',
  next: 'down' | 'partial',
): 'down' | 'partial' {
  return current === 'down' || next === 'down' ? 'down' : 'partial'
}

/** Parse SQLite `datetime('now')` (UTC, no timezone) and ISO timestamps. */
export function parseCheckedAt(value: string): number {
  const iso = value.includes('T') ? value : value.replace(' ', 'T')
  const withZone =
    /Z$/i.test(iso) || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`
  const ms = Date.parse(withZone)
  return Number.isNaN(ms) ? 0 : ms
}

function durationSeconds(start: string, endMs: number): number {
  return Math.max(0, Math.round((endMs - parseCheckedAt(start)) / 1000))
}

/**
 * Collapse per-target check history into outage windows (including recoveries).
 * Newest activity first (`recovered_at` or `started_at`).
 */
export function buildIncidents(
  rows: IncidentSourceRow[],
  opts: {limit?: number; nowMs?: number} = {},
): Incident[] {
  const limit = opts.limit ?? 50
  const nowMs = opts.nowMs ?? Date.now()
  const byTarget = new Map<number, IncidentSourceRow[]>()

  for (const row of rows) {
    const list = byTarget.get(row.target_id)
    if (list) list.push(row)
    else byTarget.set(row.target_id, [row])
  }

  const incidents: Incident[] = []

  for (const targetRows of byTarget.values()) {
    targetRows.sort((a, b) => {
      const delta = parseCheckedAt(a.checked_at) - parseCheckedAt(b.checked_at)
      return delta !== 0 ? delta : a.id - b.id
    })

    let previous: HealthStatus | null = null
    let open: Incident | null = null

    for (const row of targetRows) {
      const status = healthFromDb(row.ok) ?? 'down'
      if (previous === status) {
        continue
      }

      if (isUnhealthy(status) && (previous === null || previous === 'up')) {
        open = {
          id: row.id,
          target_id: row.target_id,
          url: row.url,
          group_tag: row.group_tag ?? null,
          status,
          recovered: false,
          started_at: row.checked_at,
          recovered_at: null,
          duration_seconds: null,
          error: row.error,
          status_code: row.status_code,
        }
        incidents.push(open)
      } else if (open && isUnhealthy(status) && isUnhealthy(previous)) {
        open.status = worseStatus(open.status, status)
      } else if (open && status === 'up') {
        open.recovered = true
        open.recovered_at = row.checked_at
        open.duration_seconds = durationSeconds(
          open.started_at,
          parseCheckedAt(row.checked_at),
        )
        open = null
      }

      previous = status
    }

    if (open) {
      open.duration_seconds = durationSeconds(open.started_at, nowMs)
    }
  }

  incidents.sort((a, b) => {
    const aAt = parseCheckedAt(a.recovered_at ?? a.started_at)
    const bAt = parseCheckedAt(b.recovered_at ?? b.started_at)
    if (aAt !== bAt) return bAt - aAt
    return b.id - a.id
  })

  return incidents.slice(0, Math.max(0, limit))
}
