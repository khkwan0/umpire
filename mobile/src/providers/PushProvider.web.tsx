import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'

interface PushContextValue {
  permission: 'unknown' | 'granted' | 'denied'
  registered: boolean
  lastError: string | null
  refresh: () => Promise<void>
}

const PushContext = createContext<PushContextValue | null>(null)

export function PushProvider({children}: {children: ReactNode}) {
  const value = useMemo(
    () => ({
      permission: 'unknown' as const,
      registered: false,
      lastError: null,
      refresh: async () => {},
    }),
    [],
  )
  return <PushContext.Provider value={value}>{children}</PushContext.Provider>
}

export function usePush(): PushContextValue {
  const ctx = useContext(PushContext)
  if (!ctx) throw new Error('usePush must be used within PushProvider')
  return ctx
}
