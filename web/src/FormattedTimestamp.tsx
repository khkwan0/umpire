import {useSyncExternalStore} from 'react'
import {
  formatTimestamp,
  getTimezonePreference,
  subscribeTimezone,
} from './datetime'

export function FormattedTimestamp({
  value,
  fallback = '—',
}: {
  value: string | null | undefined
  fallback?: string
}) {
  useSyncExternalStore(
    onStoreChange =>
      subscribeTimezone(() => {
        onStoreChange()
      }),
    getTimezonePreference,
    () => 'system' as const,
  )
  return <>{formatTimestamp(value, fallback)}</>
}
