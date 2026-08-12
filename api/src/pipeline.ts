import { getCheck, getNotifiers, getStore } from './plugins/registry.js'
import type { AlertPolicy } from './plugins/types.js'

function shouldAlert(opts: {
  policy: AlertPolicy
  throttleMinutes: number
  previouslyUp: boolean | null
  nowUp: boolean
  lastAlertAt: string | null
}): boolean {
  const { policy, throttleMinutes, previouslyUp, nowUp, lastAlertAt } = opts

  if (policy === 'every_fail') {
    return !nowUp
  }

  if (policy === 'state_change') {
    if (previouslyUp === null) return !nowUp
    return previouslyUp !== nowUp
  }

  // throttle
  if (nowUp) {
    return previouslyUp === false
  }
  if (previouslyUp === true || previouslyUp === null) {
    return true
  }
  if (!lastAlertAt) return true
  const last = Date.parse(lastAlertAt.includes('T') ? lastAlertAt : `${lastAlertAt}Z`)
  if (Number.isNaN(last)) return true
  return Date.now() - last >= throttleMinutes * 60_000
}

export async function runCheck(targetId: number): Promise<void> {
  const store = getStore()
  const target = store.getTarget(targetId)
  if (!target || !target.enabled) return

  const stateBefore = store.getTargetState(target.id)
  const previouslyUp =
    stateBefore?.is_up === null || stateBefore?.is_up === undefined
      ? null
      : Boolean(stateBefore.is_up)

  const result = await getCheck().check(target.url)
  store.recordCheckResult({
    targetId: target.id,
    ok: result.ok,
    statusCode: result.statusCode,
    error: result.error,
    latencyMs: result.latencyMs,
  })

  const settings = store.getSettings()
  const alert = shouldAlert({
    policy: settings.alert_policy,
    throttleMinutes: settings.throttle_minutes,
    previouslyUp,
    nowUp: result.ok,
    lastAlertAt: stateBefore?.last_alert_at ?? null,
  })

  if (!alert) return

  const previousStatus =
    previouslyUp === null ? 'unknown' : previouslyUp ? 'up' : 'down'
  const title = result.ok ? 'Site recovered' : 'Site down'
  const body = result.ok
    ? `${target.url} is back (HTTP 200)`
    : `${target.url} failed: ${result.error ?? 'unknown error'}`

  const event = {
    target: { id: target.id, url: target.url },
    status: result.ok ? ('up' as const) : ('down' as const),
    previousStatus: previousStatus as 'down' | 'up' | 'unknown',
    error: result.error,
    statusCode: result.statusCode,
    checkedAt: new Date().toISOString(),
    title,
    body,
  }

  const notifiers = getNotifiers()
  if (notifiers.length === 0) {
    console.warn('[pipeline] alert needed but no notifiers configured')
    return
  }

  const results = await Promise.allSettled(
    notifiers.map(async (n) => {
      try {
        await n.notify(event)
      } catch (err) {
        console.error(`[pipeline] notifier ${n.id} failed`, err)
        throw err
      }
    }),
  )

  if (results.some((r) => r.status === 'fulfilled')) {
    store.markAlertSent(target.id)
  }
}
