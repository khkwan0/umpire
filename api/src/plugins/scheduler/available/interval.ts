import type { SchedulerContext, SchedulerPlugin } from '../../types.js'

type Timer = ReturnType<typeof setTimeout>

const timers = new Map<number, Timer>()
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
      const latest = ctx.getTargets().find((t) => t.id === id)
      if (!latest || !latest.enabled) {
        clearTarget(id)
        return
      }
      await ctx.run(id)
    } catch (err) {
      console.error(`[scheduler:interval] target ${id} error`, err)
    } finally {
      if (!ctx) return
      const latest = ctx.getTargets().find((t) => t.id === id)
      if (latest?.enabled) {
        const next = setTimeout(tick, Math.max(5, latest.intervalSeconds) * 1000)
        timers.set(id, next)
      }
    }
  }

  // Startup stagger only — NOT the check interval / schedule.
  // Purpose: blunt thundering herd on boot or reschedule so many targets
  // don't all fetch at once. Ongoing cadence is intervalSeconds in `finally`.
  //
  // id % 7 → only 7 delay buckets (0..6), 250ms apart, after a 1s base:
  //   delays ≈ 1000, 1250, 1500, …, 2500 ms.
  // Implication: with more than 7 enabled targets, some share a bucket and
  // their *first* check can start together (e.g. id 1 and 8). That is OK —
  // this is soft load-spreading, not unique-per-target scheduling. After the
  // first fire, each target follows its own setTimeout chain independently.
  const delay = 1000 + (id % 7) * 250
  const first = setTimeout(tick, delay)
  timers.set(id, first)
}

function reschedule(): void {
  if (!ctx) return
  for (const id of [...timers.keys()]) clearTarget(id)
  for (const target of ctx.getTargets()) {
    if (target.enabled) {
      scheduleTarget(target.id)
    }
  }
  console.log(`[scheduler:interval] scheduled ${timers.size} target(s)`)
}

const intervalScheduler: SchedulerPlugin = {
  id: 'interval',

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
    started = false
  },

  reschedule,
}

export default intervalScheduler
