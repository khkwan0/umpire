export const THEME_STORAGE_KEY = 'umpire-theme'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const THEME_EVENT = 'umpire-theme-change'

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemePreference(stored)) return stored
  } catch {
    // ignore
  }
  return 'light'
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  return 'light'
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference)
  const root = document.documentElement
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
  return resolved
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // ignore
  }
  applyTheme(preference)
  window.dispatchEvent(new CustomEvent(THEME_EVENT, {detail: {preference}}))
}

export function subscribeTheme(
  listener: (preference: ThemePreference) => void,
): () => void {
  function onStorage(event: StorageEvent) {
    if (event.key === THEME_STORAGE_KEY) {
      listener(getThemePreference())
    }
  }
  function onCustom(event: Event) {
    const detail = (event as CustomEvent<{preference: ThemePreference}>).detail
    listener(detail?.preference ?? getThemePreference())
  }
  function onMedia() {
    if (getThemePreference() === 'system') listener('system')
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(THEME_EVENT, onCustom)
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onMedia)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(THEME_EVENT, onCustom)
    media.removeEventListener('change', onMedia)
  }
}
