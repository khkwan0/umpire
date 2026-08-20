import {aggregateCheckOutcomes, alertCopy, shouldAlert} from './alert.js'
import {getCore} from './core/index.js'
import {
  eventMatchesNotifierCheckFilter,
  extractNotifierCheckIds,
} from './core/notifierRouting.js'
import {getChecks, getNotifiers} from './plugins/registry.js'
import {isPluginEnabled} from './plugins/manager.js'
import type {AggregatedCheck, HealthStatus, Target} from './plugins/types.js'
import {healthFromDb} from './plugins/types.js'
import {publishRealtime} from './realtime.js'

/** Aggregate check plugins: all ok → up; none ok → down; mixed → partial. */
async function runAllChecks(
  target: Target,
  checkIds: string[],
): Promise<AggregatedCheck> {
  const store = getCore()
  const loaded = getChecks().filter(c => isPluginEnabled('check', c.id))
  const checks =
    checkIds.length === 0 ? loaded : loaded.filter(c => checkIds.includes(c.id))

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
      checks: [],
    }
  }

  const outcomes = await Promise.all(
    checks.map(async plugin => {
      const outcome = await plugin.check({
        target,
        config: store.getTargetCheckConfig(target.id, plugin.id),
      })
      return {
        id: plugin.id,
        ok: outcome.ok,
        statusCode: outcome.statusCode,
        error: outcome.error,
        latencyMs: outcome.latencyMs,
      }
    }),
  )

  return aggregateCheckOutcomes(outcomes)
}

export async function runCheck(targetId: number): Promise<void> {
  const store = getCore()
  const target = store.getTarget(targetId)
  if (!target || !target.enabled) return

  const stateBefore = store.getTargetState(target.id)
  const previous = healthFromDb(stateBefore?.is_up)

  const result = await runAllChecks(target, target.check_ids)
  store.recordCheckResult({
    targetId: target.id,
    status: result.status,
    statusCode: result.statusCode,
    error: result.error,
    latencyMs: result.latencyMs,
  })
  publishRealtime('status.updated', {
    reason: 'check-result',
    targetId: target.id,
  })
  publishRealtime('incidents.updated', {targetId: target.id})

  const settings = store.getSettings()
  const alert = shouldAlert({
    policy: settings.alert_policy,
    throttleMinutes: settings.throttle_minutes,
    previous,
    now: result.status,
    lastAlertAt: stateBefore?.last_alert_at ?? null,
  })

  if (!alert) return

  const {title, body} = alertCopy(result.status, target.url, result.error)

  const event = {
    target: {id: target.id, url: target.url},
    status: result.status,
    previousStatus: (previous ?? 'unknown') as HealthStatus | 'unknown',
    error: result.error,
    statusCode: result.statusCode,
    checkedAt: new Date().toISOString(),
    title,
    body,
    checks: result.checks,
  }

  const notifiersLoaded = getNotifiers().filter(n =>
    isPluginEnabled('notify', n.id),
  )
  const notifiers =
    target.notifier_ids.length === 0
      ? notifiersLoaded
      : notifiersLoaded.filter(n => target.notifier_ids.includes(n.id))
  if (notifiers.length === 0) {
    console.warn(
      target.notifier_ids.length === 0
        ? '[pipeline] alert needed but no notifiers configured'
        : `[pipeline] alert needed but no loaded notifiers match allowlist [${target.notifier_ids.join(', ')}]`,
    )
    return
  }

  const results = await Promise.allSettled(
    notifiers.map(async n => {
      try {
        const config = store.getTargetNotifierConfig(target.id, n.id)
        const checkIds = extractNotifierCheckIds(config)
        if (!eventMatchesNotifierCheckFilter(event, checkIds)) {
          return false
        }
        await n.notify({event, config})
        return true
      } catch (err) {
        console.error(`[pipeline] notifier ${n.id} failed`, err)
        throw err
      }
    }),
  )

  if (results.some(r => r.status === 'fulfilled' && r.value === true)) {
    store.markAlertSent(target.id)
  }
}
