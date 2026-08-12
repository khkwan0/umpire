import {
  enabledTokens,
  getSettings,
  getTargetState,
  listTargets,
  markAlertSent,
  recordCheckResult,
  type AlertPolicy,
  type Target,
} from './db.js'
import { sendAlert } from './fcm.js'

type Timer = ReturnType<typeof setTimeout>

const timers = new Map<number, Timer>()
let started = false

function timeoutMs(): number {
  const n = Number(process.env.CHECK_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 10_000
}

async function httpCheck(url: string): Promise<{
  ok: boolean
  statusCode: number | null
  error: string | null
  latencyMs: number
}> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs())
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'yet-another-monitoring-tool/1.0' },
    })
    const latencyMs = Date.now() - startedAt
    const ok = res.status === 200
    return {
      ok,
      statusCode: res.status,
      error: ok ? null : `HTTP ${res.status}`,
      latencyMs,
    }
  } catch (err) {
    const latencyMs = Date.now() - startedAt
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'timeout'
          : err.message
        : String(err)
    return { ok: false, statusCode: null, error: message, latencyMs }
  } finally {
    clearTimeout(timer)
  }
}

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

async function runCheck(target: Target): Promise<void> {
  const stateBefore = getTargetState(target.id)
  const previouslyUp =
    stateBefore?.is_up === null || stateBefore?.is_up === undefined
      ? null
      : Boolean(stateBefore.is_up)

  const result = await httpCheck(target.url)
  recordCheckResult({
    targetId: target.id,
    ok: result.ok,
    statusCode: result.statusCode,
    error: result.error,
    latencyMs: result.latencyMs,
  })

  const settings = getSettings()
  const alert = shouldAlert({
    policy: settings.alert_policy,
    throttleMinutes: settings.throttle_minutes,
    previouslyUp,
    nowUp: result.ok,
    lastAlertAt: stateBefore?.last_alert_at ?? null,
  })

  if (!alert) return

  const tokens = enabledTokens()
  const title = result.ok ? 'Site recovered' : 'Site down'
  const detail = result.ok
    ? `${target.url} is back (HTTP 200)`
    : `${target.url} failed: ${result.error ?? 'unknown error'}`

  try {
    await sendAlert({ tokens, title, body: detail })
    markAlertSent(target.id)
  } catch (err) {
    console.error('[checker] FCM send failed', err)
  }
}

function scheduleTarget(target: Target): void {
  clearTarget(target.id)
  if (!target.enabled) return

  const tick = async () => {
    try {
      const latest = listTargets().find((t) => t.id === target.id)
      if (!latest || !latest.enabled) {
        clearTarget(target.id)
        return
      }
      await runCheck(latest)
    } catch (err) {
      console.error(`[checker] target ${target.id} error`, err)
    } finally {
      const latest = listTargets().find((t) => t.id === target.id)
      if (latest?.enabled) {
        const next = setTimeout(tick, Math.max(5, latest.interval_seconds) * 1000)
        timers.set(target.id, next)
      }
    }
  }

  // Stagger first run slightly so many targets don't fire at once
  const delay = 1000 + (target.id % 7) * 250
  const first = setTimeout(tick, delay)
  timers.set(target.id, first)
}

function clearTarget(id: number): void {
  const t = timers.get(id)
  if (t) clearTimeout(t)
  timers.delete(id)
}

export function rescheduleAll(): void {
  for (const id of [...timers.keys()]) clearTarget(id)
  for (const target of listTargets()) scheduleTarget(target)
  console.log(`[checker] scheduled ${timers.size} target(s)`)
}

export function startChecker(): void {
  if (started) return
  started = true
  rescheduleAll()
}
