import fs from 'node:fs'
import type {NotifierPlugin} from '../../../api/src/plugins/types.js'
import {credentialsStatus, readServiceAccountFile} from './credentials.js'
import {registerFcmRoutes} from './routes.js'
import {
  initFirebase,
  isMessagingReady,
  sendToMany,
} from './send.js'
import {matchingFids, resolveFcmConfigForTarget} from './config.js'
import {
  isFcmNotifierReady,
  setFcmNotifierReady,
  syncFcmNotifierReady,
} from './runtime.js'

function initFromDisk(): void {
  const credPath = credentialsStatus().path
  if (!fs.existsSync(credPath)) {
    setFcmNotifierReady(false)
    console.warn(
      `[notify:fcm] credentials file missing at ${credPath}; alerts disabled`,
    )
    return
  }
  const parsed = readServiceAccountFile()
  if (!parsed) {
    setFcmNotifierReady(false)
    console.error('[notify:fcm] credentials file is invalid')
    return
  }
  try {
    initFirebase(parsed.account)
    syncFcmNotifierReady()
    if (isFcmNotifierReady()) console.log('[notify:fcm] initialized')
  } catch (err) {
    setFcmNotifierReady(false)
    console.error('[notify:fcm] failed to initialize', err)
  }
}

const fcmNotifier: NotifierPlugin = {
  id: 'fcm',
  description: 'Pushes alerts to Firebase Cloud Messaging FID destinations.',

  init(): void {
    initFromDisk()
  },

  isReady(): boolean {
    return isFcmNotifierReady()
  },

  async registerRoutes(app) {
    await registerFcmRoutes(app)
  },

  async notify(ctx) {
    if (!isFcmNotifierReady()) {
      console.warn('[notify:fcm] skip send — not initialized')
      return
    }
    const config = resolveFcmConfigForTarget(ctx.config)
    const destinations = matchingFids(config)
    if (destinations.length === 0) {
      console.warn('[notify:fcm] skip send — no matching destinations')
      return
    }

    const res = await sendToMany(destinations, ctx.event.title, ctx.event.body)
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
