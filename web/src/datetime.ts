export const TIMEZONE_STORAGE_KEY = 'umpire-timezone'

export type TimezonePreference = 'system' | string

const TIMEZONE_EVENT = 'umpire-timezone-change'

const FALLBACK_TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
]

let timezoneList: string[] | null = null

export function isValidTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, {timeZone: value})
    return true
  } catch {
    return false
  }
}

export function listTimezones(): string[] {
  if (timezoneList) return timezoneList
  if (typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl) {
    timezoneList = (
      Intl as typeof Intl & {supportedValuesOf: (key: string) => string[]}
    )
      .supportedValuesOf('timeZone')
      .slice()
      .sort()
    return timezoneList
  }
  timezoneList = FALLBACK_TIMEZONES
  return timezoneList
}

export function getTimezonePreference(): TimezonePreference {
  try {
    const stored = localStorage.getItem(TIMEZONE_STORAGE_KEY)
    if (stored === 'system' || stored == null) return 'system'
    if (isValidTimezone(stored)) return stored
  } catch {
    // ignore
  }
  return 'system'
}

export function resolveTimezone(preference: TimezonePreference): string {
  if (preference !== 'system') return preference
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** Parse SQLite `datetime('now')` (UTC, no suffix) and ISO timestamps. */
export function parseApiTimestamp(value: string): Date | null {
  const iso = value.includes('T') ? value : value.replace(' ', 'T')
  const withZone =
    /Z$/i.test(iso) || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`
  const ms = Date.parse(withZone)
  if (Number.isNaN(ms)) return null
  return new Date(ms)
}

export function formatTimestamp(
  value: string | null | undefined,
  fallback = '—',
): string {
  if (value == null || value === '') return fallback
  const date = parseApiTimestamp(value)
  if (!date) return value
  const timeZone = resolveTimezone(getTimezonePreference())
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(date)
}

export function setTimezonePreference(preference: TimezonePreference): void {
  try {
    localStorage.setItem(TIMEZONE_STORAGE_KEY, preference)
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent(TIMEZONE_EVENT, {detail: {preference}}))
}

export function subscribeTimezone(
  listener: (preference: TimezonePreference) => void,
): () => void {
  function onStorage(event: StorageEvent) {
    if (event.key === TIMEZONE_STORAGE_KEY) {
      listener(getTimezonePreference())
    }
  }
  function onCustom(event: Event) {
    const detail = (event as CustomEvent<{preference: TimezonePreference}>)
      .detail
    listener(detail?.preference ?? getTimezonePreference())
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(TIMEZONE_EVENT, onCustom)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(TIMEZONE_EVENT, onCustom)
  }
}
