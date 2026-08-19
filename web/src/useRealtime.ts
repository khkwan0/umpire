import { useEffect, useState } from 'react'

export type RealtimeMode = 'sse' | 'polling'

const REFRESH_EVENTS = [
  'plugin-manager.updated',
  'targets.updated',
  'status.updated',
  'incidents.updated',
] as const

export function useRealtime(onRefresh: () => void | Promise<void>): RealtimeMode {
  const [mode, setMode] = useState<RealtimeMode>('sse')

  useEffect(() => {
    let fallbackId: ReturnType<typeof setInterval> | null = null

    const startFallback = () => {
      if (fallbackId) return
      setMode('polling')
      fallbackId = setInterval(() => void onRefresh(), 5000)
    }

    const stopFallback = () => {
      if (!fallbackId) return
      clearInterval(fallbackId)
      fallbackId = null
    }

    const refresh = () => {
      void onRefresh()
    }

    const es = new EventSource('/api/stream')
    const onOpen = () => {
      stopFallback()
      setMode('sse')
    }
    const onError = () => {
      startFallback()
    }

    es.addEventListener('open', onOpen)
    for (const event of REFRESH_EVENTS) {
      es.addEventListener(event, refresh)
    }
    es.addEventListener('error', onError)

    return () => {
      stopFallback()
      es.removeEventListener('open', onOpen)
      for (const event of REFRESH_EVENTS) {
        es.removeEventListener(event, refresh)
      }
      es.removeEventListener('error', onError)
      es.close()
    }
  }, [onRefresh])

  return mode
}
