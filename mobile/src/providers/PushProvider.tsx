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
import {useAuth} from './AuthProvider'
import {useServer} from './ServerProvider'

interface PushContextValue {
  permission: 'unknown' | 'granted' | 'denied' | 'unavailable'
  registered: boolean
  lastError: string | null
  deviceSupported: boolean
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

function pushLog(message: string, detail?: unknown) {
  if (__DEV__) {
    console.log(`[push] ${message}`, detail ?? '')
  }
}

export function PushProvider({children}: {children: ReactNode}) {
  const {serverUrl} = useServer()
  const {ready: authReady, principal} = useAuth()
  const [permission, setPermission] = useState<
    'unknown' | 'granted' | 'denied' | 'unavailable'
  >('unknown')
  const [registered, setRegistered] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const lastTokenRef = useRef<string | null>(null)
  const busyRef = useRef(false)
  const deviceSupported = Platform.OS !== 'web' && Device.isDevice

  const registerToken = useCallback(async (force = false) => {
    if (Platform.OS === 'web') {
      setPermission('unavailable')
      return
    }
    if (!Device.isDevice) {
      setPermission('unavailable')
      setLastError('Push requires a physical device (not a simulator)')
      return
    }
    if (!getApiBaseUrl()) {
      pushLog('skip register — no server URL')
      return
    }
    if (busyRef.current) return

    busyRef.current = true
    try {
      const allowed = await requestPushPermission()
      setPermission(allowed ? 'granted' : 'denied')
      if (!allowed) {
        setRegistered(false)
        setLastError('Notification permission denied')
        pushLog('permission denied')
        return
      }

      await ensureNotificationChannel()
      const messaging = getMessaging()
      let token: string
      try {
        token = await getToken(messaging)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setRegistered(false)
        setLastError(
          Platform.OS === 'ios' && message.toLowerCase().includes('aps')
            ? 'FCM unavailable — add GoogleService-Info.plist and rebuild'
            : `FCM token error: ${message}`,
        )
        pushLog('getToken failed', message)
        return
      }

      if (!token) {
        setRegistered(false)
        setLastError('FCM token unavailable')
        pushLog('empty token')
        return
      }
      if (!force && token === lastTokenRef.current) {
        setRegistered(true)
        setLastError(null)
        return
      }

      pushLog('registering token', token.slice(0, 20) + '…')
      await api.fcm.register(token, deviceLabel())
      lastTokenRef.current = token
      setRegistered(true)
      setLastError(null)
      pushLog('registered with server')
    } catch (err) {
      if (isTransientApiError(err)) {
        pushLog('transient error, will retry later', err)
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      setRegistered(false)
      setLastError(message)
      pushLog('register failed', message)
    } finally {
      busyRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!serverUrl || !authReady || Platform.OS === 'web') {
      if (!serverUrl || Platform.OS === 'web') {
        setPermission('unknown')
        setRegistered(false)
        lastTokenRef.current = null
      }
      return
    }

    void registerToken()

    const messaging = getMessaging()
    const unsubscribeRefresh = onTokenRefresh(messaging, () => {
      pushLog('token refreshed')
      lastTokenRef.current = null
      void registerToken(true)
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
  }, [serverUrl, authReady, principal?.user?.id, registerToken])

  const refresh = useCallback(async () => {
    lastTokenRef.current = null
    await registerToken(true)
  }, [registerToken])

  const value = useMemo(
    () => ({
      permission,
      registered,
      lastError,
      deviceSupported,
      refresh,
    }),
    [permission, registered, lastError, deviceSupported, refresh],
  )

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>
}

export function usePush(): PushContextValue {
  const ctx = useContext(PushContext)
  if (!ctx) throw new Error('usePush must be used within PushProvider')
  return ctx
}
