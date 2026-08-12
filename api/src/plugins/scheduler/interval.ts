import type { SchedulerContext, SchedulerPlugin } from '../types.js'

type Timer = ReturnType<typeof setTimeout>

export function createIntervalScheduler(): SchedulerPlugin {
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

  return {
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
}
