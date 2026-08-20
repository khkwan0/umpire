import type {AlertEvent} from '../../../api/src/plugins/types.js'
import type {TelegramConfig} from './config.js'
import {isConfigured} from './config.js'

function endpoint(token: string): string {
  return `https://api.telegram.org/bot${token}/sendMessage`
}

export async function sendAlert(
  config: TelegramConfig,
  event: AlertEvent,
): Promise<void> {
  if (!isConfigured(config))
    throw new Error('telegram botToken/chatId are not configured')

  const body: Record<string, string> = {
    chat_id: config.chatId,
    text: `${event.title}\n${event.body}\nTarget: ${event.target.url}\nTime: ${event.checkedAt}`,
  }
  if (config.threadId) body.message_thread_id = config.threadId

  const res = await fetch(endpoint(config.botToken), {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => null)) as {
    ok?: boolean
    description?: string
  } | null
  if (!res.ok || !json?.ok) {
    throw new Error(
      `telegram send failed${json?.description ? `: ${json.description}` : ''}`,
    )
  }
}

export function testEvent(): AlertEvent {
  return {
    target: {id: 0, url: 'https://umpire.test/telegram'},
    status: 'down',
    previousStatus: 'up',
    error: 'test',
    statusCode: null,
    checkedAt: new Date().toISOString(),
    title: 'UMPIRE Telegram test',
    body: 'This is a test alert from the Telegram notifier.',
    checks: [],
  }
}
