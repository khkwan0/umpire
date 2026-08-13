import { getCore } from './core/index.js'
import { getChecks, getNotifiers } from './plugins/registry.js'
import type {
  AggregatedCheck,
  AlertPolicy,
  HealthStatus,
} from './plugins/types.js'
import { healthFromDb } from './plugins/types.js'

function shouldAlert(opts: {
  policy: AlertPolicy
  throttleMinutes: number
  previous: HealthStatus | null
  now: HealthStatus
  lastAlertAt: string | null
}): boolean {
  const { policy, throttleMinutes, previous, now, lastAlertAt } = opts

  if (policy === 'every_fail') {
    return now !== 'up'
  }

  if (policy === 'state_change') {
    if (previous === null) return now !== 'up'
    return previous !== now
  }

  // throttle
  if (now === 'up') {
    return previous !== null && previous !== 'up'
  }
  // now down or partial
  if (previous === null || previous === 'up') {
    return true
  }
  // switched between down and partial — treat as a change worth alerting
  if (previous !== now) {
    return true
  }
  if (!lastAlertAt) return true
  const last = Date.parse(lastAlertAt.includes('T') ? lastAlertAt : `${lastAlertAt}Z`)
  if (Number.isNaN(last)) return true
  return Date.now() - last >= throttleMinutes * 60_000
}

function alertCopy(status: HealthStatus, url: string, error: string | null): {
  title: string
  body: string
} {
  if (status === 'up') {
    return { title: 'Site recovered', body: `${url} is back up` }
  }
  if (status === 'partial') {
    return {
      title: 'Site partial',
      body: `${url} partial: ${error ?? 'some checks failed'}`,
    }
  }
  return {
    title: 'Site down',
    body: `${url} failed: ${error ?? 'unknown error'}`,
  }
}

/** Aggregate check plugins: all ok → up; none ok → down; mixed → partial. */
async function runAllChecks(
  url: string,
  checkIds: string[],
): Promise<AggregatedCheck> {
  const loaded = getChecks()
  const checks =
    checkIds.length === 0
      ? loaded
      : loaded.filter((c) => checkIds.includes(c.id))

  if (checks.length === 0) {
    const detail =
      checkIds.length === 0
        ? 'no check plugins loaded'
        : `no loaded checks match allowlist [${checkIds.join(', ')}]`
    return {
      status: 'down',
      statusCode: null,
      error: detail,
      latencyMs: 0,
    }
  }

  const outcomes = await Promise.all(
    checks.map(async (plugin) => {
      const outcome = await plugin.check(url)
      return { id: plugin.id, outcome }
    }),
  )

  const passed = outcomes.filter((o) => o.outcome.ok)
  const failed = outcomes.filter((o) => !o.outcome.ok)
  const latencyMs = Math.max(0, ...outcomes.map((o) => o.outcome.latencyMs))

  if (failed.length === 0) {
    const withStatus = outcomes.find((o) => o.outcome.statusCode != null)
    return {
      status: 'up',
      statusCode: withStatus?.outcome.statusCode ?? null,
      error: null,
      latencyMs,
    }
  }

  const error =
    failed.length === 1
      ? `[${failed[0]!.id}] ${failed[0]!.outcome.error ?? 'failed'}`
      : failed
          .map((f) => `[${f.id}] ${f.outcome.error ?? 'failed'}`)
          .join('; ')

  if (passed.length === 0) {
    return {
      status: 'down',
      statusCode: failed[0]!.outcome.statusCode,
      error,
      latencyMs,
    }
  }

  return {
    status: 'partial',
    statusCode: failed[0]!.outcome.statusCode,
    error,
    latencyMs,
  }
}

export async function runCheck(targetId: number): Promise<void> {
  const store = getCore()
  const target = store.getTarget(targetId)
  if (!target || !target.enabled) return

  const stateBefore = store.getTargetState(target.id)
  const previous = healthFromDb(stateBefore?.is_up)

  const result = await runAllChecks(target.url, target.check_ids)
  store.recordCheckResult({
    targetId: target.id,
    status: result.status,
    statusCode: result.statusCode,
    error: result.error,
    latencyMs: result.latencyMs,
  })

  const settings = store.getSettings()
  const alert = shouldAlert({
    policy: settings.alert_policy,
    throttleMinutes: settings.throttle_minutes,
    previous,
    now: result.status,
    lastAlertAt: stateBefore?.last_alert_at ?? null,
  })

  if (!alert) return

  const { title, body } = alertCopy(result.status, target.url, result.error)

  const event = {
    target: { id: target.id, url: target.url },
    status: result.status,
    previousStatus: (previous ?? 'unknown') as HealthStatus | 'unknown',
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
