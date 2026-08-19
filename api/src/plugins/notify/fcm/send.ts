import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import type { BaseMessage } from 'firebase-admin/messaging'

const TEST_TITLE = 'UMPIRE test'
const TEST_BODY = 'This device is registered for FCM alerts.'

export function testPushCopy(destination: string): {
  title: string
  body: string
} {
  const kind = isLegacyRegistrationToken(destination) ? 'token' : 'fid'
  return {
    title: TEST_TITLE,
    body: `${TEST_BODY}\n${kind}: ${destination}`,
  }
}

export function isMessagingReady(): boolean {
  return getApps().length > 0
}

export function initFirebase(account: ServiceAccount): void {
  if (getApps().length) return
  initializeApp({ credential: cert(account) })
}

function androidChannelId(): string | undefined {
  const id = process.env.FCM_ANDROID_CHANNEL_ID?.trim()
  return id || undefined
}

/** Legacy FCM registration tokens look like `prefix:APA91b…`. Anything else is treated as a FID. */
export function isLegacyRegistrationToken(value: string): boolean {
  return /:APA91/i.test(value)
}

/** Display payload shared by test sends and real alerts. */
export function fcmContent(title: string, body: string): BaseMessage {
  const channelId = androidChannelId()
  return {
    notification: { title, body },
    data: { title, body },
    android: {
      priority: 'high',
      notification: {
        title,
        body,
        sound: 'default',
        defaultSound: true,
        priority: 'high',
        visibility: 'public',
        ...(channelId ? { channelId } : {}),
      },
    },
    apns: {
      headers: {
        'apns-priority': '10',
        'apns-push-type': 'alert',
      },
      payload: {
        aps: {
          alert: { title, body },
          sound: 'default',
        },
      },
    },
    webpush: {
      headers: { Urgency: 'high' },
      notification: { title, body },
    },
  }
}

export async function sendToMany(
  destinations: string[],
  title = TEST_TITLE,
  body = TEST_BODY,
): Promise<{ successCount: number; failureCount: number; errors: string[] }> {
  if (!isMessagingReady()) {
    return {
      successCount: 0,
      failureCount: destinations.length,
      errors: destinations.map(() => 'FCM not initialized'),
    }
  }
  if (destinations.length === 0) {
    return { successCount: 0, failureCount: 0, errors: [] }
  }

  const content = fcmContent(title, body)
  const fids = destinations.filter((id) => !isLegacyRegistrationToken(id))
  const tokens = destinations.filter((id) => isLegacyRegistrationToken(id))
  const messaging = getMessaging()
  let successCount = 0
  let failureCount = 0
  const errors: string[] = []

  if (fids.length > 0) {
    const res = await messaging.sendEachForMulticast({ fids, ...content })
    console.log('FCM send result:', res)
    successCount += res.successCount
    failureCount += res.failureCount
    for (const r of res.responses) {
      if (!r.success && r.error) errors.push(fcmErrorMessage(r.error))
    }
  }
  if (tokens.length > 0) {
    const res = await messaging.sendEachForMulticast({ tokens, ...content })
    console.log('FCM send result:', res)
    successCount += res.successCount
    failureCount += res.failureCount
    for (const r of res.responses) {
      if (!r.success && r.error) errors.push(fcmErrorMessage(r.error))
    }
  }

  return { successCount, failureCount, errors }
}

function fcmErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const rec = err as { code?: unknown; message?: unknown }
    const code = typeof rec.code === 'string' ? rec.code : ''
    const message =
      typeof rec.message === 'string'
        ? rec.message
        : err instanceof Error
          ? err.message
          : String(err)
    return code && !message.includes(code) ? `${code}: ${message}` : message
  }
  return err instanceof Error ? err.message : String(err)
}

export function isUnregisteredTokenError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('registration-token-not-registered') ||
    lower.includes('installation-id-not-registered') ||
    lower.includes('unregistered') ||
    lower.includes('invalid-registration-token') ||
    lower.includes('not a valid fcm registration token')
  )
}
