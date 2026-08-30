import {browser} from 'wxt/browser'

export async function showDesktopNotification(
  title: string,
  message: string,
  id = `umpire-${Date.now()}`,
): Promise<void> {
  await browser.notifications.create(id, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title,
    message,
    priority: 1,
  })
}

export async function sendTestNotification(): Promise<void> {
  await showDesktopNotification(
    'UMPIRE test notification',
    'Desktop notifications are working.',
    `umpire-test-${Date.now()}`,
  )
}
