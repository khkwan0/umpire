# Chapter 5 — Scheduler plugins

[← Notifier plugins](04-notifier-plugins.md) · [Guide index](README.md) · [Next: HTTP routes & UI →](06-routes-and-ui.md)

The scheduler decides **when** each target's check cycle runs. Exactly **one** scheduler is active process-wide. The shipped `interval` plugin is the right choice for almost every install.

## When to keep `interval`

The default [`plugins/scheduler/interval/`](../../plugins/scheduler/interval/) already:

- Runs each enabled target on its own `interval_seconds` timer
- Staggers first fire so new targets do not all probe at once
- Honors Pause (`enabled: false`)
- Calls differential `reschedule()` — only restarts timers that changed

**Do not write a new scheduler just to change frequency.** Operators set `interval_seconds` per target in the UI.

Write a new scheduler only if you need a different *when*:

- Cron wall-clock schedules
- Global tick (all targets every N minutes regardless of per-target interval)
- Business-hours windows
- Jitter or backoff strategies

## Minimum viable scheduler (learning only)

**Do not ship this.** Setting `"scheduler": "hello"` replaces `interval` for the whole process.

```typescript
// plugins/scheduler/hello/index.ts
import type { SchedulerContext, SchedulerPlugin } from '../../../api/src/plugins/types.js'

let ctx: SchedulerContext | undefined
let timer: ReturnType<typeof setInterval> | undefined
const TICK_MS = 30_000

function tick(): void {
  if (!ctx) return
  for (const t of ctx.getTargets()) {
    if (!t.enabled) continue
    void ctx.run(t.id).catch(err => {
      console.error(`[scheduler:hello] target ${t.id}`, err)
    })
  }
}

const helloScheduler: SchedulerPlugin = {
  id: 'hello',
  description: 'Runs all enabled targets every 30s (ignores interval_seconds).',

  init(schedulerCtx) {
    ctx = schedulerCtx
  },

  start() {
    if (timer) return
    tick()
    timer = setInterval(tick, TICK_MS)
  },

  stop() {
    if (timer) clearInterval(timer)
    timer = undefined
  },

  reschedule() {
    // Global interval: nothing per-target to rebuild.
    // Still required — core calls this after target CRUD.
  },
}

export default helloScheduler
```

Switch back to `"scheduler": "interval"` when finished experimenting.

## Scheduler contract

```typescript
interface SchedulerContext {
  getTargets(): Array<{ id: number; intervalSeconds: number; enabled: boolean }>
  run(targetId: number): Promise<void>
}

interface SchedulerPlugin {
  id: string
  init?(ctx: SchedulerContext): void
  start(): void
  stop(): void
  reschedule(): void
  registerRoutes?(app: HttpApp): void | Promise<void>
}
```

### Lifecycle

| Phase | When | Your responsibility |
|-------|------|---------------------|
| `init(ctx)` | After plugins load, before HTTP listen | Store `ctx` reference |
| `start()` | After HTTP listen | Begin scheduling |
| `reschedule()` | After every target create/update/delete/Pause | Sync timers with `getTargets()` |
| `stop()` | Plugin manager disables scheduler, or shutdown | Clear all timers |

Core calls `reschedule()` after target CRUD — your scheduler must react.

### Rules

1. **Only `ctx.run(id)` for enabled targets** — re-check `enabled` from `getTargets()` before each run (DB can change while a timer is pending).
2. **In-flight `run` is not cancelled on Pause** — but do not schedule another tick if the target is now disabled.
3. **Use only `ctx.getTargets()` and `ctx.run(id)`** — do not import the pipeline or core write APIs.
4. **`reschedule()` must be real** — even if your scheduler uses a global tick, the method must exist and be callable.

## Production example: interval scheduler

Shipped [`plugins/scheduler/interval/index.ts`](../../plugins/scheduler/interval/index.ts):

```text
Per-target setTimeout chain:
  scheduleTarget(id)
    → tick: re-check enabled, ctx.run(id), schedule next timeout
  reschedule()
    → diff targets: start new, stop removed/disabled, skip unchanged
```

Key design choices:

- **One timer per target** — independent intervals
- **Stagger first fire** — `1000 + (id % 7) * 250` ms delay
- **Differential reschedule** — compares previous `intervalSeconds` / `enabled` snapshot; unchanged targets keep remaining delay
- **Error handling** — logs target errors, continues scheduling

Read the full source when implementing your own scheduler — it is the reference implementation.

## Cron-shaped scheduler sketch

If you need wall-clock scheduling:

```typescript
function reschedule(): void {
  if (!ctx) return
  const targets = ctx.getTargets()
  const seen = new Set<number>()

  for (const target of targets) {
    seen.add(target.id)
    if (!target.enabled) {
      clearTarget(target.id)
      continue
    }
    const msUntilNext = computeNextSlot(target)  // your cron/expression logic
    if (needsReschedule(target.id, msUntilNext)) {
      scheduleTarget(target.id, msUntilNext)
    }
  }

  for (const id of [...timers.keys()]) {
    if (!seen.has(id)) clearTarget(id)
  }
}
```

On `reschedule`: diff ids and expressions; do not reset unrelated timers.

Optional debug route:

```typescript
app.get('/timers', async () => ({
  timers: [...meta.entries()].map(([id, m]) => ({ id, ...m })),
}))
// → GET /api/plugins/scheduler/my-cron/timers
```

## Scheduler vs target interval

| Concept | Controlled by |
|---------|---------------|
| Per-target frequency | `targets.interval_seconds` (core field) |
| When the clock starts | Scheduler plugin |
| Pause | `targets.enabled = 0` + `reschedule()` |

Your scheduler should read `intervalSeconds` from `getTargets()` unless you intentionally replace per-target intervals with plugin-owned rules (document this clearly for operators).

## Testing scheduler plugins

[`plugins/scheduler/interval/index.test.ts`](../../plugins/scheduler/interval/index.test.ts) uses fake timers:

- Mock `SchedulerContext` with `getTargets` and `run`
- Call `start()`, advance timers, assert `run` called for enabled targets
- Call `reschedule()` after target changes, assert timers added/removed

## Scheduler checklist

- [ ] Exactly one scheduler id in `plugins.json`
- [ ] `init` stores context; `start` begins work; `stop` clears all timers
- [ ] `reschedule` syncs with `getTargets()` after every target change
- [ ] Disabled targets never get new ticks scheduled
- [ ] Do not import pipeline or core modules
- [ ] Prefer keeping `interval` unless you have a concrete scheduling requirement
