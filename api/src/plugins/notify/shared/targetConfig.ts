export interface NotifierTargetConfigView<T> {
  useCustom: boolean
  /** Core per-notifier check filter (empty = any alert). Set by target route wrapper. */
  check_ids?: string[]
  defaults: T
  override: T | null
  effective: T
}

export interface NotifierTargetOverrideBase {
  useCustom: boolean
}

export function parseUseCustomOverride<T extends NotifierTargetOverrideBase>(
  stored: unknown,
  isFullConfig: (row: Record<string, unknown>) => boolean,
  toFullOverride: (config: unknown) => T,
  toPartialOverride: (row: Record<string, unknown>) => T,
): T | null {
  if (stored === null || stored === undefined) return null
  if (typeof stored !== 'object' || Array.isArray(stored)) return null
  const row = stored as Record<string, unknown>
  if (row.useCustom === false) return null
  if (row.useCustom === undefined && isFullConfig(row)) {
    return toFullOverride(stored)
  }
  if (row.useCustom !== true) return null
  return toPartialOverride(row)
}

export function buildTargetConfigView<T, O extends NotifierTargetOverrideBase>(
  readDefaults: () => T,
  stored: unknown,
  parseOverride: (stored: unknown) => O | null,
  merge: (defaults: T, override: O | null) => T,
): NotifierTargetConfigView<T> {
  const defaults = readDefaults()
  const parsed = parseOverride(stored)
  const useCustom = parsed?.useCustom ?? false
  const effective = merge(defaults, parsed)
  return {
    useCustom,
    defaults,
    override: useCustom ? effective : null,
    effective,
  }
}
