import fs from 'node:fs'
import admin from 'firebase-admin'
import type { AlertEvent, NotifierPlugin } from '../../types.js'
import { registerFcmRoutes } from './routes.js'
import { matchingTokenStrings } from './tokens.js'

let ready = false

const fcmNotifier: NotifierPlugin = {
  id: 'fcm',

  init(): void {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    if (!credPath) {
      console.warn('[notify:fcm] GOOGLE_APPLICATION_CREDENTIALS not set; alerts disabled')
      return
    }
    if (!fs.existsSync(credPath)) {
      console.warn(
        `[notify:fcm] credentials file missing at ${credPath}; alerts disabled`,
      )
      return
    }
    if (admin.apps.length) {
      ready = true
      return
    }
    try {
      const raw = JSON.parse(fs.readFileSync(credPath, 'utf8')) as {
        project_id: string
        client_email: string
        private_key: string
      }
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: raw.project_id,
          clientEmail: raw.client_email,
          privateKey: raw.private_key.replace(/\\n/g, '\n'),
        }),
      })
      ready = true
      console.log('[notify:fcm] initialized')
    } catch (err) {
      console.error('[notify:fcm] failed to initialize', err)
    }
  },

  isReady(): boolean {
    return ready
  },

  async registerRoutes(app) {
    await registerFcmRoutes(app)
  },

  async notify(event: AlertEvent): Promise<void> {
    if (!ready) {
      console.warn('[notify:fcm] skip send — not initialized')
      return
    }
    const tokens = matchingTokenStrings(event)
    if (tokens.length === 0) {
      console.warn('[notify:fcm] skip send — no matching tokens')
      return
    }

    const payload = {
      tokens,
      notification: {
        title: event.title,
        body: event.body,
      },
      android: {
        priority: 'high' as const,
        notification: {
          title: event.title,
          body: event.body,
          channelId: 'Monitoring',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: event.title,
              body: event.body,
            },
            sound: 'default',
          },
        },
        headers: {
          'apns-priority': '10',
        },
      },
    }

    const res = await admin.messaging().sendEachForMulticast(payload)
    if (res.failureCount > 0) {
      console.warn(
        `[notify:fcm] ${res.failureCount}/${tokens.length} sends failed`,
        res.responses
          .filter((r) => !r.success)
          .map((r) => r.error?.message),
      )
    }
    if (res.successCount === 0) {
      throw new Error('all FCM sends failed')
    }
  },
}

export default fcmNotifier
