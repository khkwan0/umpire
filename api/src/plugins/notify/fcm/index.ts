import fs from 'node:fs'
import { getApps } from 'firebase-admin/app'
import type { AlertEvent, NotifierPlugin } from '../../types.js'
import { registerFcmRoutes } from './routes.js'
import { initFirebase, sendToMany } from './send.js'
import { matchingTokenStrings } from './tokens.js'

let ready = false

const fcmNotifier: NotifierPlugin = {
  id: 'fcm',

  init(): void {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    if (!credPath) {
      console.warn(
        '[notify:fcm] GOOGLE_APPLICATION_CREDENTIALS not set; alerts disabled',
      )
      return
    }
    if (!fs.existsSync(credPath)) {
      console.warn(
        `[notify:fcm] credentials file missing at ${credPath}; alerts disabled`,
      )
      return
    }
    if (getApps().length) {
      ready = true
      return
    }
    try {
      const raw = JSON.parse(fs.readFileSync(credPath, 'utf8')) as {
        project_id: string
        client_email: string
        private_key: string
      }
      initFirebase({
        projectId: raw.project_id,
        clientEmail: raw.client_email,
        privateKey: raw.private_key.replace(/\\n/g, '\n'),
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
    const destinations = matchingTokenStrings(event)
    if (destinations.length === 0) {
      console.warn('[notify:fcm] skip send — no matching destinations')
      return
    }

    const res = await sendToMany(destinations, event.title, event.body)
    if (res.failureCount > 0) {
      console.warn(
        `[notify:fcm] ${res.failureCount}/${destinations.length} sends failed`,
        res.errors,
      )
    }
    if (res.successCount === 0) {
      throw new Error('all FCM sends failed')
    }
  },
}

export default fcmNotifier
