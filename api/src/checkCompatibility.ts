import {isPluginEnabled} from './plugins/manager.js'
import {getChecks} from './plugins/registry.js'
import type {
  CheckPlugin,
  TargetCompatibility,
  TargetEvalParams,
} from './plugins/types.js'

export type CheckCompatibilityResult = {
  id: string
  compatible: boolean
  reason: string | null
}

export function evaluateCheckPlugin(
  plugin: CheckPlugin,
  params: TargetEvalParams,
): TargetCompatibility {
  if (!plugin.evaluateTarget) return {ok: true}
  return plugin.evaluateTarget(params)
}

/** Compatibility for every enabled loaded check plugin. */
export function evaluateChecksForTarget(
  params: TargetEvalParams,
): CheckCompatibilityResult[] {
  return getChecks()
    .filter(c => isPluginEnabled('check', c.id))
    .map(plugin => {
      const result = evaluateCheckPlugin(plugin, params)
      if (result.ok) {
        return {id: plugin.id, compatible: true, reason: null}
      }
      return {id: plugin.id, compatible: false, reason: result.reason}
    })
}

/**
 * Resolve which check plugins may run for a target.
 * Empty allowlist = all enabled loaded checks, then filter by compatibility.
 */
export function compatibleCheckPlugins(
  params: TargetEvalParams,
  allowlist: string[],
): {plugins: CheckPlugin[]; incompatible: CheckCompatibilityResult[]} {
  const loaded = getChecks().filter(c => isPluginEnabled('check', c.id))
  const selected =
    allowlist.length === 0
      ? loaded
      : loaded.filter(c => allowlist.includes(c.id))

  const plugins: CheckPlugin[] = []
  const incompatible: CheckCompatibilityResult[] = []
  for (const plugin of selected) {
    const result = evaluateCheckPlugin(plugin, params)
    if (result.ok) {
      plugins.push(plugin)
    } else {
      incompatible.push({
        id: plugin.id,
        compatible: false,
        reason: result.reason,
      })
    }
  }
  return {plugins, incompatible}
}

/** First incompatible allowlist entry, if any (for create/update validation). */
export function firstIncompatibleAllowlistId(
  params: TargetEvalParams,
  allowlist: string[],
): CheckCompatibilityResult | null {
  if (allowlist.length === 0) return null
  const byId = new Map(
    evaluateChecksForTarget(params).map(row => [row.id, row]),
  )
  for (const id of allowlist) {
    const row = byId.get(id)
    if (row && !row.compatible) return row
    if (!row) {
      // Unknown / disabled plugin — leave to existing allowlist behavior at run
      continue
    }
  }
  return null
}
