import {
  buildTargetConfigView as buildGenericTargetConfigView,
  parseUseCustomOverride,
  type NotifierTargetConfigView,
} from '../shared/targetConfig.js'
import {listDestinations, type FcmDestination} from './destinations.js'

export interface FcmConfig {
  /** Enabled destination ids to notify. Empty = all enabled destinations. */
  token_ids: number[]
}

export interface FcmTargetOverride {
  useCustom: boolean
  token_ids?: number[]
}

export type FcmTargetConfigView = NotifierTargetConfigView<FcmConfig>

export const defaultFcmConfig: FcmConfig = {
  token_ids: [],
}

export function readDefaults(): FcmConfig {
  return {...defaultFcmConfig}
}

export function normalizeTokenIds(input: unknown): number[] {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input)) {
    throw new Error('token_ids must be an array of positive integers')
  }
  const out: number[] = []
  const seen = new Set<number>()
  for (const item of input) {
    const n = typeof item === 'number' ? item : Number(item)
    if (!Number.isInteger(n) || n < 1) {
      throw new Error('token_ids must be an array of positive integers')
    }
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

export function normalizeConfig(input: unknown): FcmConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('body must be { token_ids? }')
  }
  const row = input as Record<string, unknown>
  return {
    token_ids: normalizeTokenIds(row.token_ids),
  }
}

export function isConfigured(config: FcmConfig): boolean {
  const enabled = listDestinations().filter(d => d.enabled)
  if (enabled.length === 0) return false
  if (config.token_ids.length === 0) return true
  const enabledIds = new Set(enabled.map(d => d.id))
  return config.token_ids.some(id => enabledIds.has(id))
}

function isFullFcmConfig(row: Record<string, unknown>): boolean {
  return Array.isArray(row.token_ids) && !('useCustom' in row)
}

export function parseStoredOverride(stored: unknown): FcmTargetOverride | null {
  return parseUseCustomOverride(
    stored,
    isFullFcmConfig,
    input => {
      const config = normalizeConfig(input)
      return {useCustom: true, ...config}
    },
    row => {
      const override: FcmTargetOverride = {useCustom: true}
      if (row.token_ids !== undefined) {
        override.token_ids = normalizeTokenIds(row.token_ids)
      }
      return override
    },
  )
}

export function mergeFcmConfig(
  defaults: FcmConfig,
  override: FcmTargetOverride | null,
): FcmConfig {
  if (!override?.useCustom) {
    return {
      token_ids: [...defaults.token_ids],
    }
  }
  return {
    token_ids: override.token_ids ?? [...defaults.token_ids],
  }
}

export function normalizeTargetOverride(input: unknown): FcmTargetOverride {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('body must be { useCustom: true, token_ids? }')
  }
  const row = input as Record<string, unknown>
  if (row.useCustom !== true) {
    throw new Error('useCustom must be true when saving a target override')
  }
  const config = normalizeConfig(input)
  return {useCustom: true, ...config}
}

export function buildTargetConfigView(stored: unknown): FcmTargetConfigView {
  return buildGenericTargetConfigView(
    readDefaults,
    stored,
    parseStoredOverride,
    mergeFcmConfig,
  )
}

export function resolveFcmConfigForTarget(stored: unknown): FcmConfig {
  return buildTargetConfigView(stored).effective
}

export function matchingFids(config: FcmConfig): string[] {
  const destinations = listDestinations().filter(d => d.enabled)
  const selected =
    config.token_ids.length === 0
      ? destinations
      : destinations.filter(d => config.token_ids.includes(d.id))
  return selected.map(d => d.fid)
}

export function destinationsForConfig(config: FcmConfig): FcmDestination[] {
  const destinations = listDestinations().filter(d => d.enabled)
  if (config.token_ids.length === 0) return destinations
  return destinations.filter(d => config.token_ids.includes(d.id))
}
