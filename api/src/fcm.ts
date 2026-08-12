import fs from 'node:fs'
import admin from 'firebase-admin'

let ready = false

export function initFcm(): void {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!credPath) {
    console.warn('[fcm] GOOGLE_APPLICATION_CREDENTIALS not set; alerts disabled')
    return
  }
  if (!fs.existsSync(credPath)) {
    console.warn(`[fcm] credentials file missing at ${credPath}; alerts disabled`)
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
    console.log('[fcm] initialized')
  } catch (err) {
    console.error('[fcm] failed to initialize', err)
  }
}

export function isFcmReady(): boolean {
  return ready
}

export async function sendAlert(opts: {
  tokens: string[]
  title: string
  body: string
}): Promise<void> {
  if (!ready) {
    console.warn('[fcm] skip send — not initialized')
    return
  }
  if (opts.tokens.length === 0) {
    console.warn('[fcm] skip send — no tokens')
    return
  }

  const payload = {
    tokens: opts.tokens,
    notification: {
      title: opts.title,
      body: opts.body,
    },
    android: {
      priority: 'high' as const,
      notification: {
        title: opts.title,
        body: opts.body,
        channelId: 'Monitoring',
      },
    },
    apns: {
      payload: {
        aps: {
          alert: {
            title: opts.title,
            body: opts.body,
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
      `[fcm] ${res.failureCount}/${opts.tokens.length} sends failed`,
      res.responses
        .filter((r) => !r.success)
        .map((r) => r.error?.message),
    )
  }
}
