import type {
  AggregatedCheck,
  AlertCheckOutcome,
  AlertPolicy,
  HealthStatus,
} from './plugins/types.js'

export function shouldAlert(opts: {
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

export function alertCopy(
  status: HealthStatus,
  url: string,
  error: string | null,
): {
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
export function aggregateCheckOutcomes(
  outcomes: AlertCheckOutcome[],
): AggregatedCheck {
  if (outcomes.length === 0) {
    return {
      status: 'down',
      statusCode: null,
      error: 'no check plugins loaded',
      latencyMs: 0,
      checks: [],
    }
  }

  const passed = outcomes.filter((o) => o.ok)
  const failed = outcomes.filter((o) => !o.ok)
  const latencyMs = Math.max(0, ...outcomes.map((o) => o.latencyMs))

  if (failed.length === 0) {
    const withStatus = outcomes.find((o) => o.statusCode != null)
    return {
      status: 'up',
      statusCode: withStatus?.statusCode ?? null,
      error: null,
      latencyMs,
      checks: outcomes,
    }
  }

  const error =
    failed.length === 1
      ? `[${failed[0]!.id}] ${failed[0]!.error ?? 'failed'}`
      : failed.map((f) => `[${f.id}] ${f.error ?? 'failed'}`).join('; ')

  if (passed.length === 0) {
    return {
      status: 'down',
      statusCode: failed[0]!.statusCode,
      error,
      latencyMs,
      checks: outcomes,
    }
  }

  return {
    status: 'partial',
    statusCode: failed[0]!.statusCode,
    error,
    latencyMs,
    checks: outcomes,
  }
}
