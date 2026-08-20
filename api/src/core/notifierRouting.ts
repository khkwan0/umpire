import type {AlertEvent} from '../plugins/types.js'
import {normalizePluginIds} from './sqlite.js'

/** Normalize per-notifier check allowlist on a target override. Empty = any alert. */
export function normalizeNotifierCheckIds(input: unknown): string[] {
  return normalizePluginIds(input, 'check_ids')
}

export function extractNotifierCheckIds(stored: unknown): string[] {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return []
  try {
    return normalizeNotifierCheckIds(
      (stored as Record<string, unknown>).check_ids,
    )
  } catch {
    return []
  }
}

/**
 * Whether an alert should be delivered to a notifier for this target.
 * Empty check_ids = any alert (including recovery).
 * Non-empty = only when at least one listed check failed; recoveries skipped.
 */
export function eventMatchesNotifierCheckFilter(
  event: AlertEvent,
  checkIds: string[],
): boolean {
  if (checkIds.length === 0) return true
  if (event.status === 'up') return false
  const failed = new Set(event.checks.filter(c => !c.ok).map(c => c.id))
  return checkIds.some(id => failed.has(id))
}

/** True when stored JSON has custom plugin settings (not check allowlist). */
export function hasPluginCustomOverride(stored: unknown): boolean {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return false
  }
  return (stored as Record<string, unknown>).useCustom === true
}

/** True when stored JSON has custom plugin settings and/or a check allowlist. */
export function hasNotifierTargetOverride(stored: unknown): boolean {
  return (
    hasPluginCustomOverride(stored) ||
    extractNotifierCheckIds(stored).length > 0
  )
}

export function applyNotifierCheckIds(
  stored: unknown,
  checkIds: string[],
): Record<string, unknown> | null {
  const row =
    stored && typeof stored === 'object' && !Array.isArray(stored)
      ? {...(stored as Record<string, unknown>)}
      : {}
  if (checkIds.length === 0) {
    delete row.check_ids
    if (row.useCustom === true) return row
    const leftover = Object.keys(row).filter(k => k !== 'useCustom')
    return leftover.length === 0 ? null : row
  }
  return {...row, check_ids: checkIds}
}

export function preserveNotifierCheckIds(
  stored: unknown,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const checkIds = extractNotifierCheckIds(stored)
  if (checkIds.length === 0) {
    const rest = {...next}
    delete rest.check_ids
    return rest
  }
  return {...next, check_ids: checkIds}
}
