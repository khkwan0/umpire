# Chapter 2 — Contracts reference

[← Framework](01-framework.md) · [Guide index](README.md) · [Next: Check plugins →](03-check-plugins.md)

Source of truth: [`api/src/plugins/types.ts`](../../api/src/plugins/types.ts).

This chapter separates **hard contracts** (enforced at load time or startup — your plugin will not load if you violate them) from **soft contracts** (conventions and runtime behavior you should follow but the loader does not validate).

## Hard contracts

These are enforced by the host. Violations prevent loading or crash startup.

### Load manifest (`plugins.json`)

| Rule | Error if violated |
|------|-------------------|
| File must exist | Startup throws |
| `checks` must be a non-empty array | Startup throws |
| `scheduler` must be a non-empty string | Startup throws |
| `notifiers` must be an array | Startup throws |
| Plugin file must exist under `plugins/<kind>/<id>/` | Startup throws |
| Export must pass type guard (see below) | Startup throws |
| Exported `id` must match config id | Startup throws |

### Type guards at load time

**Check plugin** — must have:

```typescript
interface CheckPlugin {
  id: string
  check(ctx: CheckContext): Promise<CheckOutcome>
  evaluateTarget?(params: TargetEvalParams): TargetCompatibility
  registerRoutes?(app: FastifyInstance): void | Promise<void>
  description?: string
}
```

Guard: `typeof id === 'string' && typeof check === 'function'`.

**Scheduler plugin** — must have:

```typescript
interface SchedulerPlugin {
  id: string
  start(): void
  stop(): void
  reschedule(): void
  init?(ctx: SchedulerContext): void
  registerRoutes?(app: FastifyInstance): void | Promise<void>
  description?: string
}
```

Guard: `id` string + `start`, `stop`, `reschedule` all functions.

**Notifier plugin** — must have:

```typescript
interface NotifierPlugin {
  id: string
  isReady(): boolean
  notify(ctx: NotifyContext): Promise<void>
  init?(): void | Promise<void>
  registerRoutes?(app: FastifyInstance): void | Promise<void>
  description?: string
}
```

Guard: `id` string + `isReady` and `notify` functions.

### Identity rule

These must all match:

- Folder name: `plugins/<kind>/<id>/`
- Entry in `plugins.json`
- `plugin.id` in your export
- UI module `id` (if you ship UI)

### HTTP route collisions

Duplicate method+path **within one plugin** fails Fastify at startup.

Do **not** register core paths like `/api/targets` from a plugin.

### Target save validation (core)

When a target has a non-empty `check_ids` allowlist that includes an incompatible check, core returns **400** before save. This uses your `evaluateTarget` hook.

## Soft contracts

These are not validated by the loader. Follow them for correct behavior and good operator experience.

### Check plugins

| Contract | If you ignore it |
|----------|------------------|
| Always return a complete `CheckOutcome` | Pipeline may mis-record results |
| Never throw for a failed probe; return `ok: false` | Uncaught errors break the pipeline |
| Include accurate `latencyMs` | Dashboard latency stats are wrong |
| Set `statusCode` when applicable, else `null` | Status display may be misleading |
| Implement `evaluateTarget` when your probe needs a specific address shape | UI cannot gray out incompatible checks; pipeline skips at run time |
| Keep `evaluateTarget` fast — no network I/O | Target form becomes slow |
| Match `evaluateTarget` rules with `check()` address parsing | UI and pipeline disagree |
| Config validation in your `config.ts` — throw on invalid input | Bad config silently misbehaves |
| Fastify `schema` on routes | Route missing from Swagger |

### Notifier plugins

| Contract | If you ignore it |
|----------|------------------|
| Deliver using `ctx.event.title` / `ctx.event.body` | Operators get wrong messages |
| Use `ctx.event.checks[].id` for per-check routing | Fragile string parsing of error text |
| `isReady() === false` → dashboard shows not ready; core **still calls** `notify()` | Surprise no-ops if you throw instead of skip |
| Not configured → soft skip (`return`, no throw) | Alert marked sent when nothing delivered |
| Hard delivery failure → throw | Alert not marked sent; operator can retry |
| Do **not** filter on `check_ids` in `notify()` | Double-filtering or wrong behavior |
| Secrets in sidecar files, not `.env` | Inconsistent with other plugins |
| `init()` failures logged; other notifiers still load | One bad plugin should not crash the host |

### Scheduler plugins

| Contract | If you ignore it |
|----------|------------------|
| Only call `ctx.run(id)` for **enabled** targets | Wasted work; race with Pause |
| Re-read `enabled` from `getTargets()` before each `run` | Runs after Pause until timer fires |
| `reschedule()` must sync timers with `getTargets()` | Orphan timers or missed targets |
| Differential `reschedule` preferred over full rebuild | Unnecessary probe bursts |
| Clear all timers in `stop()` | Leaked timers after disable |
| Do not import pipeline or core write APIs | Tight coupling; breaks on core changes |

### UI modules

| Contract | If you ignore it |
|----------|------------------|
| Default export satisfies `PluginUiModule` | Page not discovered |
| Use shared CSS classes from `web/src/styles.css` | Visual inconsistency |
| Use `@umpire/web-api` or `withBase()` for fetch paths | Subdirectory deploy breaks |
| `Dashboard` uses `status` prop, not a second `/api/status` poll | Duplicate traffic |

## Context types (what core passes you)

### CheckContext

```typescript
interface CheckContext {
  target: Target       // full target row including url, check_ids, etc.
  config: unknown      // from target_check_configs; null/undefined if none
}

interface CheckOutcome {
  ok: boolean
  statusCode: number | null
  error: string | null
  latencyMs: number
}
```

Core resolves `ctx.config` via `getTargetCheckConfig(targetId, pluginId)` before calling your `check()`.

### NotifyContext

```typescript
interface NotifyContext {
  event: AlertEvent
  config: unknown      // from target_notifier_configs; core already read check_ids
}

interface AlertEvent {
  target: { id: number; url: string }
  status: 'up' | 'down' | 'partial'
  previousStatus: 'up' | 'down' | 'partial' | 'unknown'
  error: string | null
  statusCode: number | null
  checkedAt: string
  title: string
  body: string
  checks: AlertCheckOutcome[]   // per-check results this cycle
}
```

Core already decided *whether* to alert. Your job is delivery only.

### SchedulerContext

```typescript
interface SchedulerContext {
  getTargets(): Array<{ id: number; intervalSeconds: number; enabled: boolean }>
  run(targetId: number): Promise<void>   // full check → record → maybe notify
}
```

`run()` triggers the entire pipeline for one target. Do not call it for disabled targets.

## Config storage patterns

Plugins choose how to store settings. Core provides hooks; validation is plugin-owned.

| Pattern | Example plugins | Storage |
|---------|-------------------|---------|
| No config needed | `ping`, `tls` | — |
| Global sidecar JSON | `http`, `webhook`, `slack` | `data/*.json` next to DB |
| Per-target SQLite only | `keyword-body` | `target_check_configs` |
| Global sidecar + per-target override | `http`, `webhook`, `fcm` | Sidecar + `target_*_configs` |
| Credentials file | `fcm` | `data/fcm-service-account.json` |

Standard config view shape for UIs:

```typescript
{ useCustom: boolean; defaults: T; override: T | null; effective: T }
```

Shared helpers: [`plugins/notify/shared/targetConfig.ts`](../../plugins/notify/shared/targetConfig.ts), [`targetRoutes.ts`](../../plugins/notify/shared/targetRoutes.ts).

## Do / don't summary

### Checks

| Do | Don't |
|----|--------|
| Return a full `CheckOutcome` | Call notifiers or write `check_results` |
| Timeouts with sensible defaults | Throw on probe failure |
| `evaluateTarget` for address-shape rules | Probe the network in `evaluateTarget` |
| Config via plugin routes/files | Put plugin settings in `.env` |

### Notifiers

| Do | Don't |
|----|--------|
| Deliver `title` / `body` | Decide alert policy |
| Own destinations under `/api/plugins/notify/<id>/` | Filter on `check_ids` (core does this) |
| Honest `isReady()` | Write core tables |
| Soft skip when not configured | Reimplement check allowlist UI |

### Schedulers

| Do | Don't |
|----|--------|
| `ctx.run(id)` when due | Implement HTTP checks or alerts |
| Honor `enabled` and `intervalSeconds` | Load two schedulers |
| Real `reschedule()` | Replace `interval` just to vary frequency |
