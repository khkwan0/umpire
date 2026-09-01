import * as Notifications from 'expo-notifications'
import {Platform} from 'react-native'

const DEFAULT_CHANNEL_ID = 'umpire-alerts'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export function defaultAndroidChannelId(): string {
  return DEFAULT_CHANNEL_ID
}

export async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
    name: 'UMPIRE alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    enableLights: true,
    showBadge: true,
  })
}

/**
 * FCM does not show a system banner while the app is in the foreground.
 * Present a local notification so the user still sees the message.
 */
export async function presentRemoteNotification(remoteMessage: {
  notification?: {
    title?: string | null
    body?: string | null
    android?: {channelId?: string | null} | null
  } | null
  data?: Record<string, unknown> | null
}): Promise<void> {
  if (Platform.OS === 'web') return

  const title =
    remoteMessage.notification?.title ||
    (typeof remoteMessage.data?.title === 'string'
      ? remoteMessage.data.title
      : 'UMPIRE')
  const body =
    remoteMessage.notification?.body ||
    (typeof remoteMessage.data?.body === 'string'
      ? remoteMessage.data.body
      : typeof remoteMessage.data?.message === 'string'
        ? remoteMessage.data.message
        : '')

  if (!title && !body) return

  const channelId =
    remoteMessage.notification?.android?.channelId ||
    (typeof remoteMessage.data?.channelId === 'string'
      ? remoteMessage.data.channelId
      : DEFAULT_CHANNEL_ID)

  if (Platform.OS === 'android') {
    await ensureNotificationChannel()
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: title || 'UMPIRE',
      body: body || undefined,
      data: remoteMessage.data ?? {},
      sound: true,
    },
    trigger: Platform.OS === 'android' ? {channelId} : null,
  })
}
