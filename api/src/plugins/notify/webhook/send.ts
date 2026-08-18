import type { AlertEvent } from '../../types.js'
import type { WebhookConfig } from './config.js'
import { isConfigured } from './config.js'

export async function postAlert(
  config: WebhookConfig,
  event: AlertEvent,
): Promise<void> {
  if (!isConfigured(config)) {
    throw new Error('webhook URL is not configured')
  }

  const res = await fetch(config.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...config.headers,
    },
    body: JSON.stringify(event),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `webhook HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
    )
  }
}

export function testEvent(): AlertEvent {
  return {
    target: { id: 0, url: 'https://umpire.test/webhook' },
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
