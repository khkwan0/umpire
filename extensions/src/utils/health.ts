import type {StatusTarget} from './api'

export type HealthLabel = 'up' | 'down' | 'partial' | 'unknown' | 'disabled'

export function targetHealth(target: StatusTarget): HealthLabel {
  if (!target.enabled) return 'disabled'
  if (target.is_up === 1) return 'up'
  if (target.is_up === 0) return 'down'
  if (target.is_up === 2) return 'partial'
  return 'unknown'
}

export function summarizeTargets(targets: StatusTarget[]): {
  total: number
  enabled: number
  up: number
  down: number
  partial: number
  unknown: number
  unhealthy: number
} {
  let enabled = 0
  let up = 0
  let down = 0
  let partial = 0
  let unknown = 0
  for (const t of targets) {
    const h = targetHealth(t)
    if (h === 'disabled') continue
    enabled += 1
    if (h === 'up') up += 1
    else if (h === 'down') down += 1
    else if (h === 'partial') partial += 1
    else unknown += 1
  }
  return {
    total: targets.length,
    enabled,
    up,
    down,
    partial,
    unknown,
    unhealthy: down + partial,
  }
}

export function shortHost(url: string): string {
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`)
    return u.host || url
  } catch {
    return url
  }
}
