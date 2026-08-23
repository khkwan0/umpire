import {storage} from 'wxt/utils/storage'

export type HealthSnapshot = Record<string, number | null>

export interface ExtensionSettings {
  /** Origin of the UMPIRE web/API (e.g. http://localhost:8089). */
  baseUrl: string
  notifyOnOutage: boolean
  notifyOnRecovery: boolean
  /** Poll interval when SSE is unavailable (seconds). */
  pollIntervalSeconds: number
}

export interface RuntimeCache {
  lastError: string | null
  lastSyncAt: string | null
  /** Previous per-target is_up for transition detection. */
  previousHealth: HealthSnapshot
  loginRequired: boolean
  username: string | null
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  baseUrl: 'http://localhost:8089',
  notifyOnOutage: true,
  notifyOnRecovery: true,
  pollIntervalSeconds: 15,
}

const DEFAULT_CACHE: RuntimeCache = {
  lastError: null,
  lastSyncAt: null,
  previousHealth: {},
  loginRequired: false,
  username: null,
}

export const settingsItem = storage.defineItem<ExtensionSettings>(
  'local:settings',
  {fallback: DEFAULT_SETTINGS},
)

export const cacheItem = storage.defineItem<RuntimeCache>('local:cache', {
  fallback: DEFAULT_CACHE,
})

export async function getSettings(): Promise<ExtensionSettings> {
  return settingsItem.getValue()
}

export async function setSettings(
  patch: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const current = await settingsItem.getValue()
  const next = {...current, ...patch}
  if (typeof next.baseUrl === 'string') {
    next.baseUrl = next.baseUrl.trim().replace(/\/+$/, '')
  }
  if (
    !Number.isFinite(next.pollIntervalSeconds) ||
    next.pollIntervalSeconds < 5
  ) {
    next.pollIntervalSeconds = 5
  }
  await settingsItem.setValue(next)
  return next
}

export async function getCache(): Promise<RuntimeCache> {
  return cacheItem.getValue()
}

export async function setCache(
  patch: Partial<RuntimeCache>,
): Promise<RuntimeCache> {
  const current = await cacheItem.getValue()
  const next = {...current, ...patch}
  await cacheItem.setValue(next)
  return next
}

export function originFromBaseUrl(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).origin
  } catch {
    return null
  }
}

export function hostPermissionPattern(baseUrl: string): string | null {
  const origin = originFromBaseUrl(baseUrl)
  return origin ? `${origin}/*` : null
}
