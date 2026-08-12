import type { AlertEvent, NotifierPlugin } from '../types.js'

function parseHeaders(): Record<string, string> {
  const raw = process.env.WEBHOOK_HEADERS
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn('[notify:webhook] WEBHOOK_HEADERS must be a JSON object')
      return {}
    }
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    console.warn('[notify:webhook] WEBHOOK_HEADERS is not valid JSON')
    return {}
  }
}

export function createWebhookNotifier(): NotifierPlugin {
  let ready = false
  let url = ''
  let headers: Record<string, string> = {}

  return {
    id: 'webhook',

    init(): void {
      url = (process.env.WEBHOOK_URL ?? '').trim()
      headers = parseHeaders()
      if (!url) {
        console.warn('[notify:webhook] WEBHOOK_URL not set; alerts disabled')
        ready = false
        return
      }
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          console.warn('[notify:webhook] WEBHOOK_URL must be http(s)')
          ready = false
          return
        }
      } catch {
        console.warn('[notify:webhook] WEBHOOK_URL is invalid')
        ready = false
        return
      }
      ready = true
      console.log('[notify:webhook] initialized')
    },

    isReady(): boolean {
      return ready
    },

    async notify(event: AlertEvent): Promise<void> {
      if (!ready) {
        console.warn('[notify:webhook] skip send — not initialized')
        return
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(event),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(
          `webhook HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
        )
      }
    },
  }
}
