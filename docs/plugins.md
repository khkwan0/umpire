# Plugin developer guide

Cookbook for writing UMPIRE **check**, **scheduler**, and **notifier** plugins — including optional HTTP APIs and React UI. Written so a developer or LLM can add a working plugin without reverse-engineering the repo.

Operator setup (run the app, shipped plugins, core HTTP API) lives in [`README.md`](../README.md).

## Contents

1. [Core vs plugins](#core-vs-plugins)
2. [Start here](#start-here)
3. [Mental model](#mental-model)
4. [File layout](#file-layout)
5. [Contracts](#contracts)
6. [Enable loop](#enable-loop)
7. [`registerRoutes` (plugin HTTP)](#plugin-http-apis)
8. [Plugin UIs](#plugin-uis)
9. [Dashboard widgets](#dashboard-widgets)
10. [Allowlists](#allowlists)
11. [Hello world](#hello-world) — copy-paste wiring for all three kinds
12. [Real-world examples](#real-world-examples)
13. [Do / don’t](#do--dont)
14. [Verify](#verify)
15. [Shipped references](#shipped-references)

---

## Core vs plugins

Core is the **host**. Plugins are the **workers**. Core never probes a URL, never decides *when* to probe, and never sends a push or webhook. Plugins never store monitoring history and never decide *whether* an alert should fire.

### What core handles

- The app itself: HTTP API, UI shell, and SQLite
- Loading plugins listed in `plugins.json`
- The monitoring pipeline: run checks → record the result → apply alert policy → call notifiers
- *Whether* to notify (`state_change`, `every_fail`, `throttle`)
- *Which* plugins a target uses (`check_ids` / `notifier_ids`; empty means all loaded of that kind)
- Frozen tables: `groups`, `targets`, `settings`, `check_results`, `target_state`

### What plugins handle

Three kinds. Each does one job:

| Kind | Job in one phrase |
|------|-------------------|
| **Check** | Probe the target (HTTP, TLS, DNS, …) and return ok or fail. Core records it. |
| **Scheduler** | Decide *when* a target is due, then ask core to run it. Exactly one process-wide. Keep shipped `interval` unless you need a different kind of clock. |
| **Notifier** | Deliver an alert core already decided to send (FCM, webhook, email, …). |

Optional extras (any kind): plugin-owned HTTP under `/api/plugins/…`, a nav page, a dashboard panel. Those are for *your* data (token lists, extra settings). Store that data in a sidecar file and edit it in the UI — not `.env`. They do not replace core screens or drive the pipeline.

### How core talks to plugins

They do not import each other. Core calls a few hooks. Plugins answer, or call back through a tiny context.

1. **Load** — Core reads `plugins.json` and loads those modules. If a plugin has HTTP, core mounts it under `/api/plugins/<kind>/<id>/…`.
2. **Start the clock** — After the API is listening, core calls the scheduler’s `start()`. After every target create, update, delete, or Pause, core calls `reschedule()`.
3. **Scheduler asks core to run** — When a target is due, the scheduler calls `ctx.run(targetId)`. That is the only way a check cycle starts.
4. **Core asks checks to probe** — `run` calls `check(url)` on each selected check. The plugin returns `{ ok, statusCode, error, latencyMs }` and stops there. It does not write the database.
5. **Core keeps the books** — Core aggregates outcomes, writes SQLite, and applies alert policy.
6. **Core asks notifiers to deliver** — If policy says alert, core calls `notify(event)` with a ready-made title and body. The notifier only sends.

Plugin HTTP and UI are a side channel for plugin-owned data. They are not how probes run or how alerts fire.

---

## Start here

| You want to… | Kind | Cardinality | Minimum hook |
|--------------|------|-------------|--------------|
| Probe a URL (HTTP, TLS, DNS, keyword, …) | `check` | One or more | `check(url)` |
| Decide *when* targets run (rarely: keep `interval`) | `scheduler` | **Exactly one** process-wide | `start` / `stop` / `reschedule` |
| Deliver an alert (FCM, webhook, ntfy, email, …) | `notify` | Zero or more | `isReady` + `notify(event)` |

Optional for every kind:

- `registerRoutes(app)` — plugin-owned HTTP under `/api/plugins/<kind>/<id>/…` (skip it only if core target fields are enough; [why](#plugin-http-apis))
- `ui/index.tsx` — nav item + page in the web shell
- `Dashboard` on that UI module — optional panel on the **core** home page (does not replace the dashboard)

**Default shipped set:** `http` check, `interval` scheduler, `fcm` and `webhook` notifiers.

Most plugin work is **checks** and **notifiers**. The scheduler is a plugin so a different clock is possible, but **do not replace `interval` for ordinary use**. Change how often a target runs with its `interval_seconds` (and Pause) in the UI. Write a scheduler only if you need a different *when* (cron, business hours, one global tick). Hello-world schedulers below are for learning; they replace `interval` process-wide.

**Id rule (must all match):** folder name, `plugins.json` entry, `plugin.id`, and UI `id`.

---

## Mental model

Same split as [Core vs plugins](#core-vs-plugins), as a pipeline sketch:

```text
plugins.json            → which modules load (process-wide pool)
targets[]               → what to watch (url, interval, enabled, group)
target.check_ids        → which loaded checks run for that target ([] = all)
target.notifier_ids     → which loaded notifiers get alerts ([] = all)
scheduler               → when to call core run(targetId)
core pipeline           → checks → record SQLite → alert policy → notifiers
alert policy            → whether notify() is called (not the notifier’s job)
```

Core owns SQLite (`groups`, `targets`, `settings`, `check_results`, `target_state`). Plugins **must not** `ALTER` those tables. Plugin-owned settings (destinations, extra config) live in sidecar files next to the DB and are edited through `registerRoutes` + UI — **not** `.env`. See `notify/fcm` → `data/fcm-tokens.json`, `notify/webhook` → `data/webhook.json`.

Host process identity may stay env (`DATABASE_PATH`, `GOOGLE_APPLICATION_CREDENTIALS` for the FCM Admin SDK). Those are deploy secrets, not plugin dashboard settings.

Plugins run **in-process** with API privileges. Only load code you trust. Extra npm deps go in [`api/package.json`](../api/package.json).

Source of truth for TypeScript contracts: [`api/src/plugins/types.ts`](../api/src/plugins/types.ts). UI contract: [`web/src/plugin-ui.ts`](../web/src/plugin-ui.ts).

---

## File layout

```text
api/src/plugins/<kind>/<id>/
  index.ts          # required — export default (or `plugin`)
  routes.ts         # optional — Fastify routes
  storage.ts        # optional — plugin-owned JSON/SQLite/etc.
  ui/
    index.tsx       # optional — PluginUiModule (nav + route, optional Dashboard widget)
    Page.tsx        # optional — React page
    Widget.tsx      # optional — dashboard panel (or inline in index.tsx)
```

Single-file plugins also work: `api/src/plugins/<kind>/<id>.ts`.

Loader: [`api/src/plugins/registry.ts`](../api/src/plugins/registry.ts) resolves `<id>/index.ts` then `<id>.ts`. The exported `id` **must** equal the `plugins.json` id.

Example (shipped webhook — config + UI, no env):

```text
api/src/plugins/notify/webhook/
  index.ts
  config.ts         # sidecar data/webhook.json
  send.ts
  routes.ts         # GET/PUT /config, POST /test
  ui/index.tsx
  ui/WebhookPage.tsx
```

Example (shipped FCM):

```text
api/src/plugins/notify/fcm/
  index.ts
  send.ts
  tokens.ts
  routes.ts
  ui/index.tsx
  ui/TokensPage.tsx
```

The API TypeScript build **excludes** `**/ui/**` ([`api/tsconfig.json`](../api/tsconfig.json)). The web build typechecks UI files.

---

## Contracts

### Check

```ts
interface CheckOutcome {
  ok: boolean
  statusCode: number | null
  error: string | null
  latencyMs: number
}

interface CheckPlugin {
  id: string
  check(url: string): Promise<CheckOutcome>
  registerRoutes?(app: FastifyInstance): void | Promise<void>
}
```

- Receives **only** the target `url` — not the full row, settings, or store writes.
- Always return a complete `CheckOutcome` (including `latencyMs`). Never throw for a failed probe; return `ok: false`.
- Optional `registerRoutes` is for **plugin config/CRUD**, not for running the probe. Core calls `check(url)` on a schedule. Omit it if `url` is enough (shipped `http`).

Aggregation (after selected checks finish):

| Outcomes | Status |
|----------|--------|
| All `ok: true` | `up` |
| All `ok: false` | `down` |
| Mix | `partial` |

Recorded `latency_ms` is the **max** of `latencyMs`. Failures are prefixed with `[pluginId]` and joined with `; `. DB encoding: `1` = up, `0` = down, `2` = partial.

### Notifier

```ts
interface AlertEvent {
  target: { id: number; url: string }
  status: 'down' | 'up' | 'partial'
  previousStatus: 'down' | 'up' | 'partial' | 'unknown'
  error: string | null
  statusCode: number | null
  checkedAt: string
  title: string
  body: string
  checks: Array<{
    id: string
    ok: boolean
    statusCode: number | null
    error: string | null
    latencyMs: number
  }>
}

interface NotifierPlugin {
  id: string
  init?(): void | Promise<void>
  isReady(): boolean
  notify(event: AlertEvent): Promise<void>
  registerRoutes?(app: FastifyInstance): void | Promise<void>
}
```

- Core already decided *whether* to alert. You only **deliver** `title` / `body` (and anything else you need from `AlertEvent`).
- Route per-check using `event.checks[].id` — do not parse `error` / `body` for plugin ids.
- `isReady()` is shown on the dashboard. Core **still calls** `notify` when `ready` is false; no-op or warn inside `notify`.
- Throw only on hard failure (counts against `markAlertSent`). Soft skip (not configured / no destinations) → `return` without throwing.
- `init()` failures are logged; other notifiers still load.
- Optional `registerRoutes` is for destinations/settings you own (FCM tokens, webhook URL). Omit it only when core fields (`url`, intervals, allowlists) are enough.

### Scheduler

The shipped `interval` plugin is the right scheduler for most installs. It already honors per-target `interval_seconds` and Pause. Replacing it is an advanced, process-wide swap (exactly one scheduler). Skip this contract unless you need a different kind of clock.

```ts
interface SchedulerContext {
  getTargets(): Array<{ id: number; intervalSeconds: number; enabled: boolean }>
  run(targetId: number): Promise<void> // full check → record → maybe notify
}

interface SchedulerPlugin {
  id: string
  init?(ctx: SchedulerContext): void
  start(): void
  stop(): void
  reschedule(): void
  registerRoutes?(app: FastifyInstance): void | Promise<void>
}
```

- Exactly **one** scheduler. Core calls `init` (if present), then `start()` after HTTP listen, then `reschedule()` after every target create/update/delete (including Pause).
- Only `run` enabled targets. Re-check `enabled` from `getTargets()` before each `run` (DB can change while a timer is pending).
- In-flight `run` is **not** cancelled on Pause. Do not schedule another tick if the target is now disabled.
- `reschedule` must start/stop/update work to match `getTargets()`. Differential updates (keep remaining delays) are preferred; a full rebuild is valid.
- Do **not** import the pipeline or core write APIs. Use only `ctx.getTargets()` / `ctx.run(id)`.
- Optional `registerRoutes` is rare for schedulers (debug/status at most). Timing stays in `start` / `reschedule`.

---

## Enable loop

1. Create `api/src/plugins/<kind>/<id>/index.ts` exporting `default` (or `plugin`).
2. If you need a package: `cd api && npm install <pkg>`.
3. Edit [`api/plugins.json`](../api/plugins.json):
   - checks: append to `"checks"`
   - notifier: append to `"notifiers"`
   - scheduler: set `"scheduler"` to your id (**replaces** `interval`)
4. Optional: `registerRoutes` + `ui/index.tsx` for plugin-owned settings (not `.env`).
5. Restart API (`tsx watch` reloads on save). Restart/rebuild **web** if you added UI.

Docker: plugin UI is globbed at Vite build time from `api/src/plugins/*/*/ui/index.tsx`. Rebuild the web image after adding UI ([`web/Dockerfile`](../web/Dockerfile) copies `api/src/plugins`). Prefer host `npm run dev` while iterating.

Config path override: `PLUGINS_CONFIG`.

---

## Plugin HTTP APIs

`registerRoutes(app)` is how a plugin exposes **its own** HTTP API. It is optional. Core already has `/api/targets`, `/api/groups`, `/api/settings`, history, `/api/incidents`, and status — do not recreate those. Use `registerRoutes` only for data and actions that belong to **this plugin**.

Host module: [`api/src/plugins/routes.ts`](../api/src/plugins/routes.ts).

### What `registerRoutes(app)` does

At startup, after core routes are registered, the host calls `registerRoutes` (if present) with a **scoped** Fastify instance already prefixed:

```text
/api/plugins/<kind>/<id>
```

`kind` ∈ `check` | `scheduler` | `notify`. You register **relative** paths on that scoped `app`. The host applies the prefix and records every route in the catalog (`GET /api/plugins`).

```ts
async registerRoutes(app: FastifyInstance) {
  app.get('/ping', async () => ({ ok: true }))
}
// becomes GET /api/plugins/notify/hello/ping
```

That is the whole job: attach plugin HTTP under a namespace so it cannot collide with core (`/api/targets`) or another plugin. It is **not** how probes run, how the scheduler ticks, or how alerts fire. Those stay `check(url)`, `ctx.run(id)`, and `notify(event)`.

If you omit `registerRoutes`, the plugin still loads and still appears in `GET /api/plugins` with `routes: []`. Duplicate method+path *within* one plugin fails Fastify at startup.

Do **not** register `/api/targets` or other core paths.

### When you need it — and when you don’t

Skip it when the plugin needs nothing beyond **`plugins.json`** and core target fields (`url`, `interval_seconds`, allowlists). The pipeline never needs an extra HTTP endpoint to call your hooks.

Add it when the plugin owns **runtime data or actions** that do not belong in frozen core SQLite: destination lists, extra settings, test-send buttons, import. Put those in a sidecar file + `registerRoutes` + UI. **Do not add plugin settings to `.env`.**

| `registerRoutes`? | Plugin | Why |
|-------------------|--------|-----|
| **No** | Shipped `http` check | Probe uses only the target `url` |
| **No** | Shipped `interval` scheduler | Timing uses core `interval_seconds` |
| **Yes** | Shipped `webhook` notifier | URL, HTTP method, and headers are plugin-owned (`data/webhook.json` + Webhook page) |
| **Yes** | Shipped `fcm` notifier | Many device FIDs, enable/disable, per-token filters, test push |
| **Yes** | Keyword check (cookbook below) | Needle string is plugin config, not a core column |

UI (`ui/index.tsx`) and routes are independent: a help page needs no API; curl/Swagger CRUD needs no UI. Together they are the usual pair when humans edit plugin-owned data.

There is **no auth** on the UI/API. Treat plugin routes as as trusted as the rest of the dashboard.

### Use case: FCM destinations

`notify(event)` delivers one alert. FCM still needs a list of phones. Those are not monitoring targets — they are **plugin-owned**. Core will not add a `tokens` table (frozen schema).

So the `fcm` notifier implements `registerRoutes` and keeps tokens in `data/fcm-tokens.json`:

```ts
// api/src/plugins/notify/fcm/index.ts
async registerRoutes(app) {
  await registerFcmRoutes(app)
}
```

Relative routes in [`routes.ts`](../api/src/plugins/notify/fcm/routes.ts) become:

| You register | Operators call |
|--------------|----------------|
| `GET /tokens` | `GET /api/plugins/notify/fcm/tokens` |
| `POST /tokens` | create a FID |
| `POST /tokens/:id/test` | send a test push |

The plugin UI (`ui/TokensPage.tsx`) `fetch`es those URLs. `notify()` reads the sidecar and sends. Without `registerRoutes`, operators would edit `fcm-tokens.json` by hand and could not test a device from the dashboard.

Shipped [`notify/webhook`](../api/src/plugins/notify/webhook/) is the same idea for a single URL: `GET/PUT /config` (URL, HTTP method, headers), `POST /test`, sidecar `data/webhook.json`, Webhook page in the UI. POST/PUT/PATCH/DELETE send `AlertEvent` as JSON; GET/HEAD/OPTIONS put it on the query string.

A smaller check-plugin pattern is also the same idea: `GET/PUT /config` for a keyword needle (see [keyword example](#2-check-keyword-in-response-body-plugin-config-api--ui)).

### Mechanics

Add Fastify `schema` so the route shows up in Swagger (`/documentation`). Shared component schemas live in [`api/src/openapi.ts`](../api/src/openapi.ts); plugin-local schemas can stay in `routes.ts` (see FCM).

UI pages may:

- `fetch('/api/plugins/...')` directly (no core web change), or
- add a typed helper on [`web/src/api.ts`](../web/src/api.ts) (what FCM does: `api.tokens.*`).

---

## Plugin UIs

Plugin screens belong **next to the plugin**, not under `web/src/pages`.

1. Add `api/src/plugins/<kind>/<id>/ui/index.tsx` that **default-exports** a `PluginUiModule`:

```ts
import type { PluginUiModule } from '@umpire/plugin-ui'
import HelloPage from './HelloPage'

export default {
  id: 'hello',           // must match plugin id
  kind: 'notify',        // 'check' | 'scheduler' | 'notify'
  path: '/plugins/notify/hello',
  label: 'Hello',
  Component: HelloPage,
  // Dashboard: HelloWidget,  // optional panel on /
} satisfies PluginUiModule
```

2. [`web/src/App.tsx`](../web/src/App.tsx) globs `../../api/src/plugins/*/*/ui/index.tsx`, then shows nav + routes only for plugins returned by **`GET /api/plugins`** (enabled and loaded). Optional `Dashboard` widgets on those modules appear on `/` (see [Dashboard widgets](#dashboard-widgets)).
3. Import the shared client as `@umpire/web-api` (alias to `web/src/api.ts`). Types: `@umpire/plugin-ui`.
4. Reuse existing CSS classes from [`web/src/styles.css`](../web/src/styles.css) (`panel`, `stack`, `form-row`, `muted`, `error`, `mono`, …). Add plugin-specific rules there if needed (FCM’s table styles live in the core stylesheet today).

Glob is exactly one directory of UI under `plugins/<kind>/<id>/ui/index.tsx`. Deeper nesting is not discovered.

---

## Dashboard widgets

The core Dashboard at `/` is **not** replaceable. Loaded plugins may add a **panel** under the hero stats (before the targets table). If no plugin exports `Dashboard`, the home page looks as it does today.

Same enable gate as pages: the plugin must be in `plugins.json` **and** export `ui/index.tsx`. Widgets do not add extra nav items. Order follows `GET /api/plugins` (checks, then scheduler, then notifiers).

```ts
import type { DashboardWidgetProps, PluginUiModule } from '@umpire/plugin-ui'

function HelloWidget({ status }: DashboardWidgetProps) {
  const ready = status.notifiers.find((n) => n.id === 'hello')?.ready
  return <p className="muted">Notifier ready: {ready ? 'yes' : 'no'}</p>
}

export default {
  id: 'hello',
  kind: 'notify',
  path: '/plugins/notify/hello',
  label: 'Hello',
  Component: HelloPage,
  Dashboard: HelloWidget,
} satisfies PluginUiModule
```

**Paradigms**

- `status` is the same payload the dashboard already polls every 5s (`GET /api/status`). Use it for target counts, `notifiers[].ready`, check ids. Do **not** start another `/api/status` loop.
- Extra plugin data: `fetch` or `@umpire/web-api` to `/api/plugins/<kind>/<id>/…`.
- The widget owns **inner** content only. Core wraps it in `<section className="panel">`, uses `label` as the heading, and links **Open** to `path`.
- Reuse CSS (`muted`, `pill`, `mono`). A widget-only plugin still needs `path` + `Component` (a one-panel stub page) because that is how UI modules are discovered.

A plugin without `ui/index.tsx` cannot show a widget.

---

## Allowlists

Both `check_ids` and `notifier_ids` are JSON arrays of plugin id strings on each target.

| Value | Checks | Notifiers |
|-------|--------|-----------|
| `[]` | Run **all** loaded checks | Notify via **all** loaded notifiers |
| `["http"]` / `["fcm"]` | Only that check if loaded | Only that notifier if loaded |

- Ids that are not loaded stay in the DB but are skipped this run.
- Non-empty allowlist ∩ loaded = empty: **checks** → `down` with `no loaded checks match allowlist [...]`. **notifiers** → warn, no send, do not `markAlertSent`.
- Targets UI: all unchecked = `[]` (all). API: `POST`/`PATCH /api/targets` with `check_ids` / `notifier_ids`.
- `GET /api/checks` and `GET /api/notifiers` list loaded plugins (`notifiers` include `{ id, ready }`).

Example: `checks: ["http", "tls"]`, `notifiers: ["fcm", "webhook"]`.

| Target | `check_ids` | `notifier_ids` | Run | Alert |
|--------|-------------|----------------|-----|-------|
| A | `[]` | `[]` | http + tls | FCM + webhook |
| B | `["http"]` | `["fcm"]` | http | FCM |
| C | `["tls", "dns"]` | `["webhook"]` | tls (`dns` skipped) | webhook |
| D | `["dns"]` | `["pager"]` | none → down | none → warn |

---

## Hello world

Copy these as `hello` plugins to prove **plugin + API + UI** wiring. They are not shipped. Remove them from `plugins.json` when you are done.

Shared UI page (adapt `kind` / fetch URL per plugin):

```tsx
// ui/HelloPage.tsx
import { useEffect, useState } from 'react'

export default function HelloPage() {
  const [text, setText] = useState('loading…')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetch('/api/plugins/notify/hello/ping')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((body as { error?: string }).error || res.statusText)
        setText(JSON.stringify(body))
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  return (
    <div className="stack">
      <section className="panel">
        <h2>Hello</h2>
        {error ? <p className="error">{error}</p> : <p className="mono">{text}</p>}
      </section>
    </div>
  )
}
```

Change the `fetch` path to `/api/plugins/check/hello/ping` or `/api/plugins/scheduler/hello/ping` for the other kinds.

### Check (`hello`)

`api/src/plugins/check/hello/index.ts`

```ts
import type { CheckOutcome, CheckPlugin } from '../../types.js'
import type { FastifyInstance } from 'fastify'

const helloCheck: CheckPlugin = {
  id: 'hello',

  async check(url: string): Promise<CheckOutcome> {
    const startedAt = Date.now()
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(5_000),
        headers: { 'user-agent': 'umpire-hello/1.0' },
      })
      const ok = res.status >= 200 && res.status < 400
      return {
        ok,
        statusCode: res.status,
        error: ok ? null : `HTTP ${res.status}`,
        latencyMs: Date.now() - startedAt,
      }
    } catch (err) {
      return {
        ok: false,
        statusCode: null,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startedAt,
      }
    }
  },

  async registerRoutes(app: FastifyInstance) {
    app.get('/ping', async () => ({ ok: true, plugin: 'hello', kind: 'check' }))
  },
}

export default helloCheck
```

`api/src/plugins/check/hello/ui/index.tsx`

```tsx
import type { PluginUiModule } from '@umpire/plugin-ui'
import HelloPage from './HelloPage'

export default {
  id: 'hello',
  kind: 'check',
  path: '/plugins/check/hello',
  label: 'Hello check',
  Component: HelloPage,
  Dashboard: function HelloWidget() {
    return <p className="muted">Hello check is loaded.</p>
  },
} satisfies PluginUiModule
```

`api/plugins.json` — add `"hello"` to `checks` (keep `"http"`):

```json
{
  "checks": ["http", "hello"],
  "scheduler": "interval",
  "notifiers": ["fcm", "webhook"]
}
```

On a target, leave checks unchecked (all) or tick **hello**. Confirm `GET /api/plugins` lists `{ "id": "hello", "kind": "check", "routes": [{ "method": "GET", "path": "/api/plugins/check/hello/ping" }] }`, the nav link **Hello check** appears after reloading the web UI, and `/` shows an **Hello check** panel under the stats.

### Notifier (`hello`)

`api/src/plugins/notify/hello/index.ts`

```ts
import type { AlertEvent, NotifierPlugin } from '../../types.js'
import type { FastifyInstance } from 'fastify'

const helloNotifier: NotifierPlugin = {
  id: 'hello',

  isReady() {
    return true
  },

  async notify(event: AlertEvent) {
    console.log('[notify:hello]', event.title, event.body)
  },

  async registerRoutes(app: FastifyInstance) {
    app.get('/ping', async () => ({ ok: true, plugin: 'hello', kind: 'notify' }))
  },
}

export default helloNotifier
```

`ui/index.tsx` — same as the check, but `kind: 'notify'`, `path: '/plugins/notify/hello'`, `label: 'Hello notify'`. Point `HelloPage` at `/api/plugins/notify/hello/ping`.

`plugins.json`:

```json
"notifiers": ["fcm", "webhook", "hello"]
```

Trigger an alert (or temporarily use policy `every_fail`) and watch API logs for `[notify:hello]`.

### Scheduler (`hello`)

Learning only — **do not ship this**. Setting `"scheduler": "hello"` **replaces** `interval` for the whole process.

`api/src/plugins/scheduler/hello/index.ts`

```ts
import type { SchedulerContext, SchedulerPlugin } from '../../types.js'
import type { FastifyInstance } from 'fastify'

let ctx: SchedulerContext | undefined
let timer: ReturnType<typeof setInterval> | undefined
const TICK_MS = 30_000

function tick(): void {
  if (!ctx) return
  for (const t of ctx.getTargets()) {
    if (!t.enabled) continue
    void ctx.run(t.id).catch((err) => {
      console.error(`[scheduler:hello] target ${t.id}`, err)
    })
  }
}

const helloScheduler: SchedulerPlugin = {
  id: 'hello',

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
    // Still required by the contract (core calls this after target CRUD).
  },

  async registerRoutes(app: FastifyInstance) {
    app.get('/ping', async () => ({
      ok: true,
      plugin: 'hello',
      kind: 'scheduler',
      tickMs: TICK_MS,
    }))
  },
}

export default helloScheduler
```

UI: `kind: 'scheduler'`, `path: '/plugins/scheduler/hello'`. Then set `"scheduler": "hello"` in `plugins.json`. Switch back to `"interval"` when finished — this hello scheduler ignores per-target `interval_seconds` and runs every 30s.

---

## Real-world examples

Patterns you will actually ship. Prefer env + plugin-owned files over core SQLite.

### 1. Check: TLS certificate expiry

Probe `url`’s hostname, fail if the cert expires within N days (`TLS_WARN_DAYS`, default 14). Runs **alongside** `http` so a target can be `partial` (site up, cert dying).

`api/src/plugins/check/tls/index.ts` (sketch):

```ts
import tls from 'node:tls'
import type { CheckOutcome, CheckPlugin } from '../../types.js'

function warnDays(): number {
  const n = Number(process.env.TLS_WARN_DAYS)
  return Number.isFinite(n) && n > 0 ? n : 14
}

const tlsCheck: CheckPlugin = {
  id: 'tls',

  check(url: string): Promise<CheckOutcome> {
    const startedAt = Date.now()
    return new Promise((resolve) => {
      let hostname: string
      let port: number
      try {
        const u = new URL(url)
        hostname = u.hostname
        port = u.port ? Number(u.port) : u.protocol === 'http:' ? 80 : 443
      } catch {
        resolve({
          ok: false,
          statusCode: null,
          error: 'invalid url',
          latencyMs: Date.now() - startedAt,
        })
        return
      }
      if (port === 80) {
        resolve({
          ok: false,
          statusCode: null,
          error: 'no TLS on port 80',
          latencyMs: Date.now() - startedAt,
        })
        return
      }
      const socket = tls.connect(
        { host: hostname, port, servername: hostname, timeout: 10_000 },
        () => {
          const cert = socket.getPeerCertificate()
          socket.end()
          const notAfter = cert.valid_to ? Date.parse(cert.valid_to) : NaN
          const daysLeft = (notAfter - Date.now()) / 86_400_000
          const ok = Number.isFinite(daysLeft) && daysLeft >= warnDays()
          resolve({
            ok,
            statusCode: null,
            error: ok ? null : `certificate expires in ${Math.floor(daysLeft)}d`,
            latencyMs: Date.now() - startedAt,
          })
        },
      )
      socket.on('error', (err) => {
        resolve({
          ok: false,
          statusCode: null,
          error: err.message,
          latencyMs: Date.now() - startedAt,
        })
      })
    })
  },
}

export default tlsCheck
```

Enable: `"checks": ["http", "tls"]`. Per-target: tick both, or only `tls` for cert-only hosts.

### 2. Check: keyword in response body (plugin config API + UI)

When the probe needs **settings** (needle string, JSON path), store them in a plugin file and expose CRUD. `check(url)` still receives only `url` — look up config by URL or use one global needle.

Shape:

```text
check/keyword/
  index.ts      # check() + registerRoutes → routes.ts
  config.ts     # read/write data/keyword.json
  ui/index.tsx + SettingsPage.tsx
```

`GET/PUT /api/plugins/check/keyword/config` with `{ needle: string, minStatus?: number }`. In `check()`:

1. `GET` the URL (timeout, user-agent).
2. Fail if status is not 2xx.
3. `text = await res.text()`; `ok = text.includes(config.needle)`.
4. Return `error: 'needle not found'` when missing.

UI: one panel, input for needle, Save → `PUT`. Use `api` helpers if you add them to `web/src/api.ts`, otherwise `fetch`.

This is the usual “check plugin with a settings page” pattern.

### 3. Notifier: ntfy (`notify()` skeleton)

Phone notifications without FCM. Client installs [ntfy](https://ntfy.sh); UMPIRE POSTs to a topic.

```ts
import type { AlertEvent, NotifierPlugin } from '../../types.js'

let url = ''

const ntfy: NotifierPlugin = {
  id: 'ntfy',

  init() {
    url = (process.env.NTFY_URL ?? '').trim()
    if (!url) console.warn('[notify:ntfy] NTFY_URL not set')
  },

  isReady() {
    return Boolean(url)
  },

  async notify(event: AlertEvent) {
    if (!url) {
      console.warn('[notify:ntfy] skip — not configured')
      return
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        title: event.title,
        'content-type': 'text/plain',
      },
      body: event.body,
    })
    if (!res.ok) {
      throw new Error(`ntfy HTTP ${res.status}`)
    }
  },
}

export default ntfy
```

`NTFY_URL=https://ntfy.sh/your-secret-topic` in this snippet is abbreviated. For a real plugin, copy shipped [`notify/webhook`](../api/src/plugins/notify/webhook/): sidecar + `GET/PUT /config` + UI, not `.env`.

### 4. Notifier: many destinations + routing + test + UI

Production pattern: **FCM**. Copy this when users manage a list of destinations in the UI.

| Piece | FCM does | You should |
|-------|----------|------------|
| Storage | `data/fcm-tokens.json` (`FCM_TOKENS_PATH`) | Sidecar file next to `DATABASE_PATH`, not a core table |
| CRUD | `GET/POST/PATCH/DELETE /tokens` | Relative paths on `registerRoutes` |
| Routing | `target_ids` / `check_ids` / `enabled` | Filter in `notify` from `event.target.id` and `event.checks` |
| Test | `POST /tokens/:id/test` | Optional; record last error on the row |
| Send | Admin SDK `sendEachForMulticast` | Your provider; throw only if *all* sends fail |
| UI | `ui/TokensPage.tsx` + `api.tokens` in `web/src/api.ts` | Nav via `PluginUiModule`; typed client optional |
| OpenAPI | Fastify `schema` + `FcmToken` component | Add schemas so Swagger lists your routes |

Destination matching (FCM):

| Field | Empty | Non-empty |
|-------|--------|-----------|
| `target_ids` | all targets | only those ids |
| `check_ids` | any alert including recovery | only when a listed check **failed**; recoveries skipped |
| `enabled` | — | `0` never receives |

No matching destinations → return without throwing (soft skip).

Read: [`api/src/plugins/notify/fcm/`](../api/src/plugins/notify/fcm/) (`index.ts`, `tokens.ts`, `routes.ts`, `send.ts`, `ui/`).

### 5. Scheduler: keep `interval` (usually)

**Leave `interval` enabled.** It already does what most people want: one timer per target, Pause, and frequency via core `interval_seconds`. You cannot load two schedulers; do not write another one just to vary frequency.

Shipped [`scheduler/interval`](../api/src/plugins/scheduler/interval/index.ts):

- One `setTimeout` chain per enabled target.
- First fire staggered by id.
- `reschedule()` only restarts timers that were added, removed, enabled/disabled, or whose `intervalSeconds` changed — others keep remaining delay.
- Before `run`, re-reads `enabled`. After Pause, core calls `reschedule()` so that target stops.

Write a new scheduler only if you need a different *when* (cron wall clock, global tick, jitter, “business hours”).

Cron-shaped `reschedule` sketch:

```ts
// For each enabled target, compute ms until next wall-clock slot from
// intervalSeconds (or a plugin-owned cron string). clearTimeout + setTimeout.
// On reschedule: diff ids / expressions; do not reset unrelated timers.
```

Optional `GET /api/plugins/scheduler/<id>/timers` that returns `{ id, nextRunAt }[]` for a debug UI.

### 6. Typed web client (when the UI grows)

Hello world can `fetch`. Once you have several endpoints, add a namespace on [`web/src/api.ts`](../web/src/api.ts) next to `tokens`:

```ts
keyword: {
  get: () => request<{ needle: string }>('/api/plugins/check/keyword/config'),
  put: (data: { needle: string }) =>
    request<{ needle: string }>('/api/plugins/check/keyword/config', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
},
```

Plugin pages import `{ api } from '@umpire/web-api'`. Reuse the existing `request()` helper (JSON, `204`, `error` field).

### 7. Dashboard widget (FCM-style counts)

Add `Dashboard` next to the existing page. Use `status` for ready flags; fetch plugin CRUD for live counts.

```tsx
import { useEffect, useState } from 'react'
import { api } from '@umpire/web-api'
import type { DashboardWidgetProps, PluginUiModule } from '@umpire/plugin-ui'
import TokensPage from './TokensPage'

function FcmWidget({ status }: DashboardWidgetProps) {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    void api.tokens.list().then((rows) => setCount(rows.length))
  }, [status])
  const ready = status.notifiers.find((n) => n.id === 'fcm')?.ready
  return (
    <p>
      {count == null ? '…' : count} destination{count === 1 ? '' : 's'}
      {ready === false ? ' (FCM off)' : ''}
    </p>
  )
}

export default {
  id: 'fcm',
  kind: 'notify',
  path: '/plugins/notify/fcm',
  label: 'FCM FIDs',
  Component: TokensPage,
  Dashboard: FcmWidget,
} satisfies PluginUiModule
```

`status` in the `useEffect` dependency refreshes the count on each dashboard poll without a second `/api/status` loop. Remove the plugin from `notifiers` in `plugins.json` and the widget disappears.

---

## Do / don’t

### Checks

| Do | Don’t |
|----|--------|
| Return a full `CheckOutcome` | Call notifiers or write `check_results` |
| Timeouts with a sensible default; extra settings via plugin routes/files | Expect more than `url` from core |
| `statusCode` when it applies, else `null` | Mutate core tables |
| Config via plugin routes/files if you need more than `url` | Throw on probe failure; put settings in `.env` |

### Notifiers

| Do | Don’t |
|----|--------|
| Deliver `title` / `body` | Decide alert policy |
| Own destinations under `/api/plugins/notify/<id>` | Write `check_results` / `target_state` |
| Honest `isReady()` | Assume you are the only notifier |
| Secrets in plugin sidecar files (or host credentials for SDKs) | Put notifier tables into core SQLite |
| Relative paths (`/tokens`, `/config`) | Absolute core paths (`/api/targets`); plugin settings in `.env` |
| Filter with `event.checks[].id` | Parse `error` / `body` for check ids |

### Schedulers

| Do | Don’t |
|----|--------|
| `ctx.run(id)` when due | Implement HTTP checks or alerts |
| Honor `enabled` and `intervalSeconds` | Assume rows never change without `reschedule` |
| Clear work in `stop()` | Enable more than one scheduler |
| Real `reschedule()` | Use extra schedulers just to vary frequency |

### Core schema

Frozen tables: `groups`, `targets` (includes `check_ids`, `notifier_ids`), `settings`, `check_results`, `target_state`.

`GET /api/schema` publishes the schema; `?data=1` dumps those tables. Plugins may **read** via `getCore()`; they should not rely on mutating core tables.

---

## Verify

After enabling a plugin:

1. API log line: `[plugins] check=…` / `notifier=… ready=…` / `scheduler=…`
2. `GET /api/status` includes the id (`notifiers[].ready` for notifiers)
3. `GET /api/plugins` includes the id and any routes
4. Swagger `/documentation` lists routes that have `schema`
5. Web nav shows the UI label **only if** `ui/index.tsx` exists **and** the plugin is loaded
6. If the UI module exports `Dashboard`, `/` shows a panel titled with `label` (under the stats, before Targets)
7. Docker: rebuild `web` after adding UI; Vite glob is build-time
8. Target checkboxes show the new check/notifier id
9. For notifiers: fire a test alert; confirm delivery or an honest log skip

---

## Shipped references

| Plugin | Path | Why read it |
|--------|------|-------------|
| HTTP check | [`api/src/plugins/check/http/index.ts`](../api/src/plugins/check/http/index.ts) | Minimal check, timeout default, no UI |
| Interval scheduler | [`api/src/plugins/scheduler/interval/index.ts`](../api/src/plugins/scheduler/interval/index.ts) | Differential `reschedule`, Pause, stagger |
| Webhook notifier | [`api/src/plugins/notify/webhook/`](../api/src/plugins/notify/webhook/) | Sidecar + method/URL/headers + test + UI |
| FCM notifier | [`api/src/plugins/notify/fcm/`](../api/src/plugins/notify/fcm/) | Storage, CRUD, OpenAPI, test sends, full UI |

Host pieces: [`registry.ts`](../api/src/plugins/registry.ts) (load), [`routes.ts`](../api/src/plugins/routes.ts) (mount + catalog), [`web/src/App.tsx`](../web/src/App.tsx) (UI glob + dashboard widgets), [`web/src/plugin-ui.ts`](../web/src/plugin-ui.ts) (`PluginUiModule` / `Dashboard`), [`web/src/pages/Dashboard.tsx`](../web/src/pages/Dashboard.tsx) (widget slot), [`web/src/api.ts`](../web/src/api.ts) (HTTP client).
