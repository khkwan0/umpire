import {createContext, useContext, useEffect} from 'react'

export type RealtimeMode = 'sse' | 'reconnecting' | 'polling'

export type RealtimeContextValue = {
  mode: RealtimeMode
  subscribe: (handler: () => void) => () => void
}

export const RealtimeContext = createContext<RealtimeContextValue | null>(null)

function useRealtimeContext(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext)
  if (!ctx) {
    throw new Error('useRealtimeContext must be used within RealtimeProvider')
  }
  return ctx
}

export function useRealtimeMode(): RealtimeMode {
  return useRealtimeContext().mode
}

export function useRealtimeRefresh(
  onRefresh: () => void | Promise<void>,
): void {
  const {subscribe} = useRealtimeContext()

  useEffect(() => {
    return subscribe(() => {
      void onRefresh()
    })
  }, [subscribe, onRefresh])
}
