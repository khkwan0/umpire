import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  AuthorizationStatus,
  getMessaging,
  getToken,
  onMessage,
  onTokenRefresh,
  requestPermission,
} from '@react-native-firebase/messaging'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import {PermissionsAndroid, Platform} from 'react-native'
import {api, getApiBaseUrl, isTransientApiError} from '@/lib/api'
import {
  ensureNotificationChannel,
  presentRemoteNotification,
} from '@/lib/notifications'
import {useServer} from './ServerProvider'

interface PushContextValue {
  permission: 'unknown' | 'granted' | 'denied'
  registered: boolean
  lastError: string | null
  refresh: () => Promise<void>
}

const PushContext = createContext<PushContextValue | null>(null)

async function requestPushPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false
  if (!Device.isDevice) return false

  if (Platform.OS === 'android') {
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    )
  }

  if (Platform.OS === 'ios') {
    const messaging = getMessaging()
    const authStatus = await requestPermission(messaging)
    const enabled =
      authStatus === AuthorizationStatus.AUTHORIZED ||
      authStatus === AuthorizationStatus.PROVISIONAL
    if (!enabled) return false
    const expoStatus = await Notifications.requestPermissionsAsync({
      ios: {allowAlert: true, allowBadge: true, allowSound: true},
    })
    return expoStatus.granted
  }

  const expoStatus = await Notifications.getPermissionsAsync()
  if (expoStatus.granted) return true
  const requested = await Notifications.requestPermissionsAsync()
  return requested.granted
}

function deviceLabel(): string {
  const model = Device.modelName?.trim()
  const os = `${Platform.OS} ${Device.osVersion ?? ''}`.trim()
  if (model) return `${model} (${os})`
  return os || 'mobile'
}

export function PushProvider({children}: {children: ReactNode}) {
  const {serverUrl} = useServer()
  const [permission, setPermission] = useState<
    'unknown' | 'granted' | 'denied'
  >('unknown')
  const [registered, setRegistered] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const lastTokenRef = useRef<string | null>(null)
  const busyRef = useRef(false)

  const registerToken = useCallback(async () => {
    if (Platform.OS === 'web' || !Device.isDevice) return
    if (!getApiBaseUrl()) return
    if (busyRef.current) return

    busyRef.current = true
    try {
      const allowed = await requestPushPermission()
      setPermission(allowed ? 'granted' : 'denied')
      if (!allowed) {
        setRegistered(false)
        return
      }

      await ensureNotificationChannel()
      const messaging = getMessaging()
      const token = await getToken(messaging)
      if (!token) {
        setRegistered(false)
        setLastError('FCM token unavailable')
        return
      }
      if (token === lastTokenRef.current) {
        setRegistered(true)
        setLastError(null)
        return
      }

      await api.fcm.register(token, deviceLabel())
      lastTokenRef.current = token
      setRegistered(true)
      setLastError(null)
    } catch (err) {
      if (isTransientApiError(err)) return
      setRegistered(false)
      setLastError(err instanceof Error ? err.message : String(err))
    } finally {
      busyRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!serverUrl || Platform.OS === 'web') {
      setPermission('unknown')
      setRegistered(false)
      lastTokenRef.current = null
      return
    }

    void registerToken()

    const messaging = getMessaging()
    const unsubscribeRefresh = onTokenRefresh(messaging, () => {
      lastTokenRef.current = null
      void registerToken()
    })
    const unsubscribeMessage = onMessage(messaging, async remoteMessage => {
      try {
        await presentRemoteNotification(remoteMessage)
      } catch (err) {
        console.error('[push] foreground notification failed', err)
      }
    })

    return () => {
      unsubscribeRefresh()
      unsubscribeMessage()
    }
  }, [serverUrl, registerToken])

  const value = useMemo(
    () => ({
      permission,
      registered,
      lastError,
      refresh: registerToken,
    }),
    [permission, registered, lastError, registerToken],
  )

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>
}

export function usePush(): PushContextValue {
  const ctx = useContext(PushContext)
  if (!ctx) throw new Error('usePush must be used within PushProvider')
  return ctx
}
