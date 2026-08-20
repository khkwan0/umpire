import {useEffect, useState} from 'react'
import {
  applyTheme,
  getThemePreference,
  setThemePreference,
  subscribeTheme,
  type ThemePreference,
} from './theme'

const OPTIONS: Array<{id: ThemePreference; label: string}> = [
  {id: 'light', label: 'Light'},
  {id: 'dark', label: 'Dark'},
  {id: 'system', label: 'System'},
]

export default function ThemeSwitcher({labelledBy}: {labelledBy?: string}) {
  const [preference, setPreference] = useState<ThemePreference>(() =>
    getThemePreference(),
  )

  useEffect(() => {
    applyTheme(getThemePreference())
    return subscribeTheme(next => {
      setPreference(next)
      applyTheme(next)
    })
  }, [])

  return (
    <div
      className="theme-switcher"
      role="radiogroup"
      aria-label={labelledBy ? undefined : 'Color theme'}
      aria-labelledby={labelledBy}
    >
      {OPTIONS.map(option => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={preference === option.id}
          className={
            preference === option.id
              ? 'theme-switcher-option active'
              : 'theme-switcher-option'
          }
          onClick={() => setThemePreference(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
