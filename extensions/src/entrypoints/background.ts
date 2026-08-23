import {browser} from 'wxt/browser'
import {defineBackground} from 'wxt/utils/define-background'
import {ApiError, api, streamUrl, type StatusTarget} from '../utils/api'
import {shortHost, summarizeTargets, targetHealth} from '../utils/health'
import {hasHostPermission} from '../utils/permissions'
import {
  getCache,
  getSettings,
  setCache,
  type HealthSnapshot,
} from '../utils/storage'

const ALARM_POLL = 'umpire-poll'
const REFRESH_EVENTS = new Set([
  'plugin-manager.updated',
  'targets.updated',
  'status.updated',
  'incidents.updated',
])

let syncing = false
let eventSource: EventSource | null = null

function snapshotFromTargets(targets: StatusTarget[]): HealthSnapshot {
  const out: HealthSnapshot = {}
  for (const t of targets) {
    out[String(t.id)] = t.is_up
  }
  return out
}

async function setBadge(
  text: string,
  color: string,
  title: string,
): Promise<void> {
  await browser.action.setBadgeText({text})
  await browser.action.setBadgeBackgroundColor({color})
  await browser.action.setTitle({title})
}

async function notify(
  id: string,
  title: string,
  message: string,
): Promise<void> {
  try {
    await browser.notifications.create(id, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title,
      message,
      priority: 1,
    })
  } catch {
    // Notifications may be denied by the user/OS.
  }
}

function isUnhealthy(isUp: number | null | undefined): boolean {
  return isUp === 0 || isUp === 2
}

function wasHealthy(isUp: number | null | undefined): boolean {
  return isUp === 1
}

async function emitTransitions(
  targets: StatusTarget[],
  previous: HealthSnapshot,
  notifyOnOutage: boolean,
  notifyOnRecovery: boolean,
): Promise<void> {
  const hadPrevious = Object.keys(previous).length > 0
  if (!hadPrevious) return

  for (const target of targets) {
    if (!target.enabled) continue
    const key = String(target.id)
    const prev = previous[key]
    const next = target.is_up
    const label = shortHost(target.url)

    if (
      notifyOnOutage &&
      prev !== undefined &&
      wasHealthy(prev) &&
      isUnhealthy(next)
    ) {
      const state = targetHealth(target)
      await notify(
        `outage-${target.id}-${Date.now()}`,
        state === 'partial' ? 'Partial outage' : 'Outage detected',
        `${label}${target.last_error ? `: ${target.last_error}` : ''}`,
      )
    }

    if (
      notifyOnRecovery &&
      prev !== undefined &&
      isUnhealthy(prev) &&
      wasHealthy(next)
    ) {
      await notify(
        `recovery-${target.id}-${Date.now()}`,
        'Target recovered',
        label,
      )
    }
  }
}

async function schedulePoll(seconds: number): Promise<void> {
  await browser.alarms.clear(ALARM_POLL)
  await browser.alarms.create(ALARM_POLL, {
    periodInMinutes: Math.max(seconds, 5) / 60,
  })
}

function stopSse(): void {
  if (!eventSource) return
  eventSource.close()
  eventSource = null
}

async function startSse(baseUrl: string): Promise<void> {
  stopSse()
  try {
    const es = new EventSource(streamUrl(baseUrl))
    eventSource = es

    const onRefresh = () => {
      void refreshNow('sse')
    }
    for (const name of REFRESH_EVENTS) {
      es.addEventListener(name, onRefresh)
    }
    es.onerror = () => {
      stopSse()
    }
  } catch {
    stopSse()
  }
}

export async function refreshNow(reason = 'manual'): Promise<void> {
  if (syncing) return
  syncing = true
  try {
    const settings = await getSettings()
    if (!settings.baseUrl) {
      await setBadge('?', '#6b7280', 'UMPIRE — set the server URL in options')
      await setCache({
        lastError: 'Configure the UMPIRE base URL in extension options.',
        lastSyncAt: null,
      })
      return
    }

    const allowed = await hasHostPermission(settings.baseUrl)
    if (!allowed) {
      await setBadge('!', '#b45309', 'UMPIRE — grant site access in options')
      await setCache({
        lastError: 'Grant access to your UMPIRE site in Options, then retry.',
        lastSyncAt: null,
      })
      stopSse()
      return
    }

    const policy = await api.policy(settings.baseUrl)
    if (policy.login_required) {
      try {
        const me = await api.me(settings.baseUrl)
        await setCache({
          loginRequired: true,
          username: me.principal.user?.username ?? null,
          lastError: null,
        })
      } catch (err) {
        const message =
          err instanceof ApiError && err.status === 401
            ? 'Login required'
            : err instanceof Error
              ? err.message
              : 'Login required'
        await setBadge('…', '#b45309', `UMPIRE — ${message}`)
        await setCache({
          loginRequired: true,
          username: null,
          lastError: message,
          lastSyncAt: new Date().toISOString(),
        })
        stopSse()
        return
      }
    } else {
      await setCache({loginRequired: false, username: null})
    }

    const status = await api.status(settings.baseUrl)
    const cache = await getCache()
    await emitTransitions(
      status.targets,
      cache.previousHealth,
      settings.notifyOnOutage,
      settings.notifyOnRecovery,
    )

    const summary = summarizeTargets(status.targets)
    const nextSnap = snapshotFromTargets(status.targets)
    await setCache({
      previousHealth: nextSnap,
      lastError: null,
      lastSyncAt: new Date().toISOString(),
    })

    if (summary.enabled === 0) {
      await setBadge('-', '#6b7280', 'UMPIRE — no enabled targets')
    } else if (summary.unhealthy === 0) {
      await setBadge(
        String(summary.up),
        '#15803d',
        `UMPIRE — ${summary.up} up`,
      )
    } else {
      await setBadge(
        String(summary.unhealthy),
        '#b91c1c',
        `UMPIRE — ${summary.down} down, ${summary.partial} partial`,
      )
    }

    if (reason !== 'sse' || !eventSource) {
      await startSse(settings.baseUrl)
    }
    await schedulePoll(settings.pollIntervalSeconds)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    await setBadge('!', '#b91c1c', `UMPIRE — ${message}`)
    await setCache({
      lastError: message,
      lastSyncAt: new Date().toISOString(),
    })
    stopSse()
  } finally {
    syncing = false
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void refreshNow('install')
  })

  browser.runtime.onStartup.addListener(() => {
    void refreshNow('startup')
  })

  browser.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === ALARM_POLL) void refreshNow('alarm')
  })

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'refresh') {
      void refreshNow('message')
        .then(() => sendResponse({ok: true}))
        .catch((err: unknown) =>
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : 'Refresh failed',
          }),
        )
      return true
    }
    if (message?.type === 'settings-changed') {
      stopSse()
      void refreshNow('settings')
        .then(() => sendResponse({ok: true}))
        .catch((err: unknown) =>
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : 'Refresh failed',
          }),
        )
      return true
    }
    return undefined
  })

  void refreshNow('boot')
})
