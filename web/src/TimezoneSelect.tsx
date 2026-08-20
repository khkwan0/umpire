import {useEffect, useMemo, useState} from 'react'
import {
  getTimezonePreference,
  listTimezones,
  resolveTimezone,
  setTimezonePreference,
  subscribeTimezone,
  type TimezonePreference,
} from './datetime'

export default function TimezoneSelect({labelledBy}: {labelledBy?: string}) {
  const [preference, setPreference] = useState<TimezonePreference>(() =>
    getTimezonePreference(),
  )
  const timezones = useMemo(() => listTimezones(), [])

  useEffect(() => {
    return subscribeTimezone(next => setPreference(next))
  }, [])

  const resolved = resolveTimezone(preference)

  return (
    <label className="timezone-select">
      <span className={labelledBy ? 'sr-only' : undefined}>Timezone</span>
      <select
        aria-labelledby={labelledBy}
        value={preference}
        onChange={e => {
          const next = e.target.value as TimezonePreference
          setPreference(next)
          setTimezonePreference(next)
        }}
      >
        <option value="system">
          System ({Intl.DateTimeFormat().resolvedOptions().timeZone})
        </option>
        <option value="UTC">UTC</option>
        {timezones
          .filter(tz => tz !== 'UTC')
          .map(tz => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
      </select>
      <span className="muted small">
        Timestamps display in <span className="mono">{resolved}</span>.
      </span>
    </label>
  )
}
