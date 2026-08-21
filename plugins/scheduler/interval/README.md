# `interval` (scheduler plugin)

Runs each enabled target on its own interval timer, staggering first checks so they do not all fire at once.

## Usage

### Enable

1. **`interval` must be the sole scheduler** in [`api/plugins.json`](../../../api/plugins.json) (`"scheduler": "interval"`). You cannot load two schedulers.
2. Keep it **enabled** in **Settings → Plugin manager** (on by default).

### Configure

No plugin-owned settings. Timing comes from **core target fields**:

| Field | Where |
|-------|--------|
| `interval_seconds` | Each target (UI **Targets**, API `POST/PATCH /api/targets`) |
| `enabled` | Target row — **Pause** sets `enabled: false` |

Minimum interval: **5 seconds**. First run is staggered by target id (`1000 + (id % 7) * 250` ms) to spread load.

### When to replace

**Keep `interval` for almost every deployment.** Write a different scheduler only if you need a different *kind* of clock (cron, business hours, global tick). Per-target frequency is already handled by `interval_seconds`.

## API

No plugin HTTP routes. Control scheduling via:

- `PATCH /api/targets/:id` — change `interval_seconds` or `enabled`
- `PUT /api/plugin-manager/scheduler/interval` — disable only if switching schedulers (requires `plugins.json` change + restart)

## For developers

```text
plugins/scheduler/interval/
  index.ts       # init, start, reschedule, per-target setTimeout chains
  index.test.ts
```

**Behavior:**

- One timer chain per enabled target.
- `reschedule()` (called after target create/update/delete or pause) only restarts targets whose id, `enabled`, or `intervalSeconds` changed — others keep remaining delay.
- Before each `run(id)`, re-reads `enabled` from context.

Reference for differential reschedule and Pause integration.

See also: [Plugin developer guide](../../../docs/plugins.md), [Core guide](../../../docs/core.md).
