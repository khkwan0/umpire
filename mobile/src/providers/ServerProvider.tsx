import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {canonicalizeBaseUrl, setApiBaseUrl} from '@/lib/api'
import {
  clearServerUrl,
  getServerUrl,
  setServerUrl as persistServerUrl,
} from '@/lib/storage'

interface ServerContextValue {
  ready: boolean
  serverUrl: string | null
  connect: (url: string) => Promise<void>
  disconnect: () => Promise<void>
}

const ServerContext = createContext<ServerContextValue | null>(null)

export function ServerProvider({children}: {children: ReactNode}) {
  const [ready, setReady] = useState(false)
  const [serverUrl, setServerUrl] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const stored = await getServerUrl()
      if (stored) {
        setApiBaseUrl(stored)
        setServerUrl(stored)
      }
      setReady(true)
    })()
  }, [])

  const connect = useCallback(async (url: string) => {
    const trimmed = url.trim().replace(/\/+$/, '')
    const canonical = await canonicalizeBaseUrl(trimmed)
    await persistServerUrl(canonical)
    setApiBaseUrl(canonical)
    setServerUrl(canonical)
  }, [])

  const disconnect = useCallback(async () => {
    setApiBaseUrl('')
    setServerUrl(null)
    await clearServerUrl()
  }, [])

  const value = useMemo(
    () => ({ready, serverUrl, connect, disconnect}),
    [ready, serverUrl, connect, disconnect],
  )

  return (
    <ServerContext.Provider value={value}>{children}</ServerContext.Provider>
  )
}

export function useServer(): ServerContextValue {
  const ctx = useContext(ServerContext)
  if (!ctx) throw new Error('useServer must be used within ServerProvider')
  return ctx
}
