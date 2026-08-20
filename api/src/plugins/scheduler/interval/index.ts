// Reference interval scheduler: per-target setTimeout chains.
// reschedule() only touches targets that were added, removed, enabled/disabled,
// or whose interval changed — other timers keep their remaining delay.

import type {SchedulerContext, SchedulerPlugin} from '../../types.js'

type Timer = ReturnType<typeof setTimeout>

type TargetMeta = {
  intervalSeconds: number
  enabled: boolean
}

const timers = new Map<number, Timer>()
/** Last schedule-relevant snapshot (used to skip unchanged targets on reschedule). */
const meta = new Map<number, TargetMeta>()
let ctx: SchedulerContext | undefined
let started = false

function clearTarget(id: number): void {
  const t = timers.get(id)
  if (t) clearTimeout(t)
  timers.delete(id)
}

function scheduleTarget(id: number): void {
  clearTarget(id)

  const tick = async () => {
    if (!ctx) return
    try {
      const latest = ctx.getTargets().find(t => t.id === id)
      if (!latest || !latest.enabled) {
        clearTarget(id)
        if (latest) {
          meta.set(id, {
            intervalSeconds: latest.intervalSeconds,
            enabled: false,
          })
        } else {
          meta.delete(id)
        }
        return
      }
      await ctx.run(id)
    } catch (err) {
      console.error(`[scheduler:interval] target ${id} error`, err)
    } finally {
      if (!ctx) return
      const latest = ctx.getTargets().find(t => t.id === id)
      if (latest?.enabled) {
        const next = setTimeout(
          tick,
          Math.max(5, latest.intervalSeconds) * 1000,
        )
        timers.set(id, next)
        meta.set(id, {
          intervalSeconds: latest.intervalSeconds,
          enabled: true,
        })
      } else {
        clearTarget(id)
        if (latest) {
          meta.set(id, {
            intervalSeconds: latest.intervalSeconds,
            enabled: false,
          })
        }
      }
    }
  }

  // Stagger first fire so many new targets don't start in the same millisecond.
  const delay = 1000 + (id % 7) * 250
  const first = setTimeout(tick, delay)
  timers.set(id, first)
}

function reschedule(): void {
  if (!ctx) return

  const targets = ctx.getTargets()
  const seen = new Set<number>()
  let startedCount = 0
  let stoppedCount = 0
  let unchangedCount = 0

  for (const target of targets) {
    seen.add(target.id)
    const prev = meta.get(target.id)

    if (!target.enabled) {
      if (timers.has(target.id)) {
        clearTarget(target.id)
        stoppedCount++
      }
      meta.set(target.id, {
        intervalSeconds: target.intervalSeconds,
        enabled: false,
      })
      continue
    }

    const intervalChanged =
      prev !== undefined && prev.intervalSeconds !== target.intervalSeconds
    const needsStart = !timers.has(target.id)

    if (needsStart || intervalChanged) {
      scheduleTarget(target.id)
      meta.set(target.id, {
        intervalSeconds: target.intervalSeconds,
        enabled: true,
      })
      startedCount++
    } else {
      meta.set(target.id, {
        intervalSeconds: target.intervalSeconds,
        enabled: true,
      })
      unchangedCount++
    }
  }

  for (const id of [...timers.keys()]) {
    if (!seen.has(id)) {
      clearTarget(id)
      stoppedCount++
    }
  }
  for (const id of [...meta.keys()]) {
    if (!seen.has(id)) meta.delete(id)
  }

  console.log(
    `[scheduler:interval] timers=${timers.size} started=${startedCount} stopped=${stoppedCount} unchanged=${unchangedCount}`,
  )
}

const intervalScheduler: SchedulerPlugin = {
  id: 'interval',
  description:
    'Runs each enabled target on its own interval timer, staggering first checks so they do not all fire together.',

  init(schedulerCtx: SchedulerContext): void {
    ctx = schedulerCtx
  },

  start(): void {
    if (started) return
    started = true
    reschedule()
  },

  stop(): void {
    for (const id of [...timers.keys()]) clearTarget(id)
    meta.clear()
    started = false
  },

  reschedule,
}

export default intervalScheduler
