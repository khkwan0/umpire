import type {AlertEvent} from '../../types.js'
import type {WebhookConfig} from './config.js'
import {isConfigured, WEBHOOK_BODY_METHODS} from './config.js'

function withQueryPayload(url: string, event: AlertEvent): string {
  const dest = new URL(url)
  dest.searchParams.set('title', event.title)
  dest.searchParams.set('body', event.body)
  dest.searchParams.set('status', event.status)
  dest.searchParams.set('previousStatus', event.previousStatus)
  dest.searchParams.set('error', event.error ?? '')
  if (event.statusCode != null) {
    dest.searchParams.set('statusCode', String(event.statusCode))
  }
  dest.searchParams.set('checkedAt', event.checkedAt)
  dest.searchParams.set('targetId', String(event.target.id))
  dest.searchParams.set('targetUrl', event.target.url)
  dest.searchParams.set('payload', JSON.stringify(event))
  return dest.toString()
}

export async function sendAlert(
  config: WebhookConfig,
  event: AlertEvent,
): Promise<void> {
  if (!isConfigured(config)) {
    throw new Error('webhook URL is not configured')
  }

  const useBody = WEBHOOK_BODY_METHODS.has(config.method)
  const headers: Record<string, string> = {...config.headers}
  if (
    useBody &&
    !Object.keys(headers).some(k => k.toLowerCase() === 'content-type')
  ) {
    headers['content-type'] = 'application/json'
  }

  const res = await fetch(
    useBody ? config.url : withQueryPayload(config.url, event),
    {
      method: config.method,
      headers,
      body: useBody ? JSON.stringify(event) : undefined,
    },
  )

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `webhook HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
    )
  }
}

export function testEvent(): AlertEvent {
  return {
    target: {id: 0, url: 'https://umpire.test/webhook'},
    status: 'down',
    previousStatus: 'up',
    error: 'test',
    statusCode: null,
    checkedAt: new Date().toISOString(),
    title: 'UMPIRE webhook test',
    body: 'This is a test alert from the webhook notifier.',
    checks: [],
  }
}
