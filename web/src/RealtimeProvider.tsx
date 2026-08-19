import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type RealtimeMode = 'sse' | 'reconnecting' | 'polling'

const REFRESH_EVENTS = [
  'plugin-manager.updated',
  'targets.updated',
  'status.updated',
  'incidents.updated',
] as const

const DEGRADE_AFTER_MS = 8000
const POLL_INTERVAL_MS = 5000

type RealtimeContextValue = {
  mode: RealtimeMode
  subscribe: (handler: () => void) => () => void
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null)

function useRealtimeContext(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext)
  if (!ctx) {
    throw new Error('useRealtimeContext must be used within RealtimeProvider')
  }
  return ctx
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<RealtimeMode>('sse')
  const listenersRef = useRef(new Set<() => void>())

  useEffect(() => {
    let es: EventSource | null = null
    let fallbackId: ReturnType<typeof setInterval> | null = null
    let degradeTimer: ReturnType<typeof setTimeout> | null = null

    const clearDegradeTimer = () => {
      if (!degradeTimer) return
      clearTimeout(degradeTimer)
      degradeTimer = null
    }

    const stopFallback = () => {
      if (!fallbackId) return
      clearInterval(fallbackId)
      fallbackId = null
    }

    const notifyListeners = () => {
      for (const fn of listenersRef.current) {
        try {
          fn()
        } catch {
          // ignore listener errors
        }
      }
    }

    const markAlive = () => {
      clearDegradeTimer()
      stopFallback()
      setMode('sse')
    }

    const startFallback = () => {
      if (fallbackId) return
      setMode('polling')
      fallbackId = setInterval(() => notifyListeners(), POLL_INTERVAL_MS)
    }

    const scheduleDegrade = () => {
      clearDegradeTimer()
      setMode((current) => (current === 'polling' ? 'polling' : 'reconnecting'))
      degradeTimer = setTimeout(() => {
        if (!es || es.readyState !== EventSource.OPEN) {
          startFallback()
        }
      }, DEGRADE_AFTER_MS)
    }

    es = new EventSource('/api/stream')

    es.addEventListener('open', markAlive)
    es.addEventListener('connected', markAlive)
    es.addEventListener('heartbeat', markAlive)

    for (const event of REFRESH_EVENTS) {
      es.addEventListener(event, () => {
        markAlive()
        notifyListeners()
      })
    }

    es.addEventListener('error', () => {
      if (!es || es.readyState === EventSource.OPEN) return
      scheduleDegrade()
    })

    return () => {
      clearDegradeTimer()
      stopFallback()
      es?.close()
      es = null
    }
  }, [])

  const subscribe = useCallback((handler: () => void) => {
    listenersRef.current.add(handler)
    return () => {
      listenersRef.current.delete(handler)
    }
  }, [])

  return (
    <RealtimeContext.Provider value={{ mode, subscribe }}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtimeMode(): RealtimeMode {
  return useRealtimeContext().mode
}

export function useRealtimeRefresh(onRefresh: () => void | Promise<void>): void {
  const { subscribe } = useRealtimeContext()
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    return subscribe(() => {
      void onRefreshRef.current()
    })
  }, [subscribe])
}
