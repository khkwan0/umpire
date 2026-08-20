import type {AlertEvent} from '../../types.js'
import type {SlackConfig} from './config.js'
import {isConfigured} from './config.js'

export async function sendAlert(
  config: SlackConfig,
  event: AlertEvent,
): Promise<void> {
  if (!isConfigured(config))
    throw new Error('slack webhookUrl is not configured')

  const payload = {
    username: config.username,
    text: `*${event.title}*\n${event.body}\nTarget: ${event.target.url}\nTime: ${event.checkedAt}`,
  }

  const res = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `slack HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
    )
  }
}

export function testEvent(): AlertEvent {
  return {
    target: {id: 0, url: 'https://umpire.test/slack'},
    status: 'down',
    previousStatus: 'up',
    error: 'test',
    statusCode: null,
    checkedAt: new Date().toISOString(),
    title: 'UMPIRE Slack test',
    body: 'This is a test alert from the Slack notifier.',
    checks: [],
  }
}
