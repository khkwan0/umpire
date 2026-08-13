# UMPIRE

**Universal Monitoring Plugin & Incident Reporter** — standalone monitoring with a config UI and pluggable checks, scheduling, and alerts. Core stores monitoring data in SQLite. Ships with an HTTP uptime checker by default; check plugins can probe anything.

## What it does

- Periodically runs one or more **check plugins** against each target (default: HTTP GET, 200 = healthy)
- Sends alerts according to a configurable policy via one or more **notifier plugins**
- Stores targets, groups, settings, and check history in **core SQLite** (frozen schema)
- Times checks via a **scheduler plugin** (default: per-target intervals)
- Plugin-specific data (e.g. FCM tokens) is owned by that plugin, not core

## Services

| Service | Role |
|---------|------|
| `api` | Fastify API + core SQLite + plugin host (check / scheduler / notifiers) |
| `web` | Vite/React UI behind nginx (`/api` proxied to `api`) |

UI default: [http://localhost:8089](http://localhost:8089)

## Quick start (local — preferred for development)

```bash
cp .env.example .env
cp firebase-service-account.json.example firebase-service-account.json
# edit firebase-service-account.json with a real Firebase Admin service account

cd api && npm install && \
  DATABASE_PATH=../data/monitor.sqlite \
  GOOGLE_APPLICATION_CREDENTIALS=../firebase-service-account.json \
  npm run dev
```

In another terminal:

```bash
cd web && npm install && npm run dev
```

Or run with Docker Compose (optional deploy path):

```bash
docker compose up --build -d
```

Open the UI, add a target URL + interval, add an FCM device token (if using the `fcm` notifier), pick an alert policy.

Without valid Firebase credentials the API still runs and checks targets; the FCM notifier reports `ready: false` on the dashboard.

## Plugins

Core owns the check → record → alert-policy → notify pipeline and the frozen SQLite tables. Plugins implement contracts; core calls their hooks.

Enable plugins by editing [`api/plugins.json`](api/plugins.json) (or set `PLUGINS_CONFIG` to another path):

```json
{
  "checks": ["http"],
  "scheduler": "interval",
  "notifiers": ["fcm"]
}
```

Implementations live under `api/src/plugins/<kind>/<id>/` (one subdirectory per plugin). The registry loads each id from `plugins.json` as `<kind>/<id>/index.ts` (or `<kind>/<id>.ts` for a single-file plugin).

| Kind | Path | Cardinality |
|------|------|-------------|
| Checks | `plugins/check/<id>/` | One or more in `plugins.json` |
| Scheduler | `plugins/scheduler/<id>/` | Exactly one in `plugins.json` |
| Notifiers | `plugins/notify/<id>/` | Zero or more — pool for per-target allowlists |

Optional **UI** for a plugin lives beside it at `ui/index.tsx` (see [Plugin UI hooks](#plugin-ui-hooks)). Core web does not own plugin-specific pages (e.g. FCM tokens).

Example package (FCM):

```text
api/src/plugins/notify/fcm/
  index.ts       # NotifierPlugin
  tokens.ts      # plugin-owned storage
  routes.ts      # registerRoutes → /tokens
  ui/
    index.tsx    # PluginUiModule
    TokensPage.tsx
```

### How targets, checks, and notifiers mix

Composition is **global plugins + per-target check and notifier allowlists**.

```text
plugins.json            → which check / scheduler / notifier modules load
targets[]               → what to watch (url, interval, enabled, group)
target.check_ids        → which of the loaded checks run for that target
target.notifier_ids     → which of the loaded notifiers get alerts for that target
alert policy            → whether to notify after a run
```

| Layer | Scope | Mix-and-match |
|-------|--------|----------------|
| **Checks in `plugins.json`** | Process-wide | Enable any set of check plugins (e.g. `http` + `tls`). They are the pool of available probes. |
| **`target.check_ids`** | Per target | Restrict which loaded checks run for that target. |
| **Notifiers in `plugins.json`** | Process-wide | Enable any set (e.g. `fcm` + `webhook`). They are the pool of available alert channels. |
| **`target.notifier_ids`** | Per target | Restrict which loaded notifiers receive alerts for that target. |
| **Scheduler** | Process-wide | Exactly one; decides *when* each enabled target runs. |

#### Allowlist semantics (`check_ids` / `notifier_ids`)

Both are stored on each target as a JSON array of plugin id strings.

| Value | Checks (`check_ids`) | Notifiers (`notifier_ids`) |
|-------|----------------------|----------------------------|
| `[]` (default / omitted on create) | Run **all** loaded checks. | Notify via **all** loaded notifiers. |
| `["http"]` / `["fcm"]` | Run only that check if loaded. | Alert only that notifier if loaded. |
| `["http", "tls"]` | Intersection with loaded checks; selected run in parallel. | Intersection with loaded notifiers; each receives the same `AlertEvent`. |

Further rules (shared unless noted):

1. **Empty = all** — backward compatible with “every target uses every loaded plugin of that kind.”
2. **Intersection at run time** — ids in the allowlist that are not loaded are **kept in the DB** (so you can enable that plugin later) but **skipped** for this run / alert.
3. **Non-empty allowlist ∩ loaded = empty** — **checks:** no probes run; result is **`down`** with an error like `no loaded checks match allowlist [...]`. **notifiers:** nothing is sent; core logs a warning and does **not** call `markAlertSent` (so a later run can still try when a matching notifier is available).
4. **Paused targets** (`enabled: 0`) — scheduler does not run them; allowlists are irrelevant until resumed.
5. **Check aggregation** (after the selected checks finish): all ok → `up`; all fail → `down`; mix → `partial`. Recorded latency is the max of the selected checks’ `latencyMs`.
6. **UI** — Targets page checkboxes for checks and notifiers; **all unchecked = all** (`[]`). Checking one or more sets an explicit allowlist. Summary shows `all` or the id list.
7. **API** — `POST`/`PATCH /api/targets` with `check_ids` / `notifier_ids` (`string[]`); always returned on read. `GET /api/checks` and `GET /api/notifiers` list loaded plugins for the UI (`notifiers` include `{ id, ready }`).

#### Example

`plugins.json` has `checks: ["http", "tls"]` and `notifiers: ["fcm", "webhook"]`.

| Target | `check_ids` | `notifier_ids` | On each run | On alert |
|--------|-------------|----------------|-------------|----------|
| A | `[]` | `[]` | `http` + `tls` | FCM + webhook |
| B | `["http"]` | `["fcm"]` | `http` only | FCM only |
| C | `["tls", "dns"]` | `["webhook"]` | `tls` only (`dns` not loaded → ignored) | webhook only |
| D | `["dns"]` | `["pager"]` | none loaded → **down** + error | none loaded → warn, no send |

There is **no store plugin**. Core SQLite is fixed. Extra deps for a custom plugin go in [`api/package.json`](api/package.json) (`cd api && npm install <pkg>`), then list the plugin id in `plugins.json`, then `npm run dev` (`tsx watch` reloads on save).

Only load plugins you wrote or trust — they run in-process with API privileges. There is no in-app dependency installer.

Defaults: `http`, `interval`, `fcm`. Every plugin module must export the plugin as `default` or `plugin`, and its `id` must match the id listed in `plugins.json`.

To enable webhook:

1. Add `"webhook"` to `notifiers` in `plugins.json`.
2. Set `WEBHOOK_URL` (and optional `WEBHOOK_HEADERS` JSON).
3. Restart / let `npm run dev` reload.

### Write a check

One or more checks in `plugins.json`. For each target run, core selects which checks to invoke using that target’s **`check_ids`** (see [How targets, checks, and notifiers mix](#how-targets-checks-and-notifiers-mix)), runs them in parallel against the target URL, aggregates outcomes, records the result, then maybe alerts. A check plugin only answers “is this URL ok?” for its probe type.

#### Contract

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
}
```

A valid check **must** implement `check`. It receives only the target’s `url` string — not the full target row, settings, or store writes. Export as `default` or `plugin`.

#### Lifecycle (what core does)

1. Load each id from `plugins.json` → `check/<id>/index.ts` (or `check/<id>.ts`).
2. When the scheduler calls `run(targetId)`, core loads the target and, if `enabled`, resolves checks from `check_ids` (or all if empty), then calls each selected `check(url)` via `Promise.all`.
3. Core aggregates outcomes into one health status, writes `check_results` / `target_state`, then applies the alert policy.

Checks are not started/stopped like the scheduler; they are invoked on demand.

#### Aggregation

| Outcomes | Aggregated status |
|----------|-------------------|
| All `ok: true` | `up` |
| All `ok: false` | `down` |
| Mix of ok / not ok | `partial` |

- Recorded `latency_ms` is the **max** of the individual `latencyMs` values.
- On failure, `error` is prefixed with `[pluginId]` (multiple failures joined with `; `).
- DB encoding for status / `ok`: `1` = up, `0` = down, `2` = partial.

#### Responsibilities

| Do | Don’t |
|----|--------|
| Return a complete `CheckOutcome` (including `latencyMs`) | Call notifiers or write check results yourself |
| Treat non-success as `ok: false` with a useful `error` | Assume you are the only check plugin |
| Keep probes self-contained (timeouts, env for your probe) | Expect more than `url` from core |
| Use `statusCode` when applicable (else `null`) | Mutate core tables |

Reference: [`api/src/plugins/check/http/index.ts`](api/src/plugins/check/http/index.ts) (HTTP GET, 200 = healthy, `CHECK_TIMEOUT_MS`).

#### Enable your check

1. Add `api/src/plugins/check/my-check/index.ts` (or `check/my-check.ts`).
2. Add `"my-check"` to the `checks` array in [`api/plugins.json`](api/plugins.json) (keep or remove `http` as you prefer).
3. Restart / let `npm run dev` reload.
4. Optionally restrict which targets use it via `check_ids` / `notifier_ids` on those targets (Targets UI or API).

### Write a notifier

Zero or more notifiers in `plugins.json`. When the alert policy says an alert is needed, core selects which notifiers to invoke using that target’s **`notifier_ids`** (empty = all loaded; see [mix semantics](#how-targets-checks-and-notifiers-mix)), then calls each with the same `AlertEvent`. Notifiers deliver the alert; they do not decide *whether* to alert.

#### Contract

```ts
interface AlertCheckOutcome {
  id: string
  ok: boolean
  statusCode: number | null
  error: string | null
  latencyMs: number
}

interface AlertEvent {
  target: { id: number; url: string }
  status: 'down' | 'up' | 'partial'
  previousStatus: 'down' | 'up' | 'partial' | 'unknown'
  error: string | null
  statusCode: number | null
  checkedAt: string
  title: string
  body: string
  /** Per-check outcomes for this run; empty if none ran. */
  checks: AlertCheckOutcome[]
}

interface NotifierPlugin {
  id: string
  init?(): void | Promise<void>
  isReady(): boolean
  notify(event: AlertEvent): Promise<void>
  /** Optional — mount routes relative to /api/plugins/<kind>/<id> (host applies the prefix). */
  registerRoutes?(app: FastifyInstance): void | Promise<void>
}
```

A valid notifier **must** implement `isReady` and `notify`. `init` is optional but typical (read env, connect, load plugin-owned data). Optional `registerRoutes` receives a **scoped** Fastify instance already prefixed with `/api/plugins/<kind>/<id>` — register paths like `/tokens`, not `/api/…`. Export as `default` or `plugin`. Treat `AlertEvent` field names as a stable contract. Use `checks` for per-check routing (e.g. which destinations care about `http` vs `tls`); do not parse `error` / `body` for check ids.

#### Lifecycle (what core does)

1. Load each id from `plugins.json` → `notify/<id>/index.ts` (or `notify/<id>.ts`).
2. Call `init()` if present (failures are logged; other notifiers still load).
3. After core HTTP routes are registered, mount each plugin under `/api/plugins/<kind>/<id>` and call `registerRoutes` if present (checks, then scheduler, then notifiers). Record routes for `GET /api/plugins`.
4. On each alert, core filters by `notifier_ids`, then runs the selected notifiers with `Promise.allSettled` (one failure does not block the others).
5. If **at least one** `notify` fulfills, core calls `markAlertSent` for throttle / policy bookkeeping.
6. Status / dashboard exposes each notifier’s `id` and `isReady()` as `ready`.

#### Plugin HTTP routes (namespaced)

**Why:** Plugins often need their own HTTP surface (CRUD for plugin-owned data) without hardcoding those routes in core. Letting plugins register freely on the root Fastify app risked collisions with core (`/api/targets`, …) and with each other. The host therefore owns the URL map: every plugin is isolated under a fixed prefix, and core exposes a catalog of what was mounted.

**Mental model:**

1. After core routes load, the host calls [`mountAllPluginRoutes`](api/src/plugins/routes.ts) for every loaded check, the scheduler, and every notifier.
2. Each plugin is encapsulated at **`/api/plugins/<kind>/<pluginId>`** (`kind` ∈ `check` | `scheduler` | `notify`).
3. If the plugin implements `registerRoutes`, it receives a **scoped** Fastify app and should register **relative** paths only (e.g. `/tokens` → `/api/plugins/notify/fcm/tokens`).
4. While mounting, the host records `{ method, path }` (fully qualified) into an in-memory catalog — including plugins with **no** `registerRoutes` (`routes: []`).
5. **`GET /api/plugins`** returns that catalog.

Collisions across plugins (or with core) are prevented by the prefix. Duplicate method+path *within* one plugin still fails Fastify at startup.

Implementation: [`api/src/plugins/routes.ts`](api/src/plugins/routes.ts).

#### `isReady` and `notify`

- `isReady()` should reflect whether the notifier can actually send (credentials present, URL configured, etc.). It is surfaced on the dashboard; core does **not** skip `notify` solely because `ready` is false — your `notify` should no-op or warn if not ready.
- `notify` should throw only on hard failure if you want that attempt counted as rejected for `markAlertSent`. Soft skip (not configured / no matching destinations) should return without throwing.
- Non-core destinations (FCM tokens, Slack webhooks beyond env, etc.) are **owned by the notifier** — not core SQLite.

#### FCM token routing (plugin-owned)

The `fcm` notifier stores tokens in `data/fcm-tokens.json` (`FCM_TOKENS_PATH` overrides the path) and registers `GET/POST/PATCH/DELETE /tokens` via `registerRoutes`, exposed as **`/api/plugins/notify/fcm/tokens`**.

Each token may restrict who gets which alerts:

| Field | Empty | Non-empty |
|-------|--------|-----------|
| `target_ids` | all targets | only those target ids |
| `check_ids` | any alert for a matching target (including recovery) | only when at least one listed check failed; **recoveries skipped** |

Disabled tokens never receive alerts. No matching tokens → soft skip (no throw).

References:

- [`api/src/plugins/notify/fcm/`](api/src/plugins/notify/fcm/) (`index.ts`, `tokens.ts`, `routes.ts`, optional `ui/`)
- [`api/src/plugins/notify/webhook/index.ts`](api/src/plugins/notify/webhook/index.ts) (`WEBHOOK_URL`, optional `WEBHOOK_HEADERS`)

#### Responsibilities

| Do | Don’t |
|----|--------|
| Deliver `title` / `body` (and any extra fields you need from `AlertEvent`) | Decide alert policy (core already did) |
| Own your config, destinations, and optional `registerRoutes` under `/api/plugins/<kind>/<id>` | Write `check_results` / `target_state` |
| Implement honest `isReady()` | Assume you are the only notifier |
| Keep secrets in env or plugin-owned files | Put notifier-specific tables into core |
| Register relative paths only (e.g. `/tokens`) | Register absolute core paths like `/api/targets` |

#### Enable your notifier

1. Add `api/src/plugins/notify/my-notifier/index.ts`.
2. If you need a package (e.g. `pg`): `cd api && npm install pg`.
3. Add `"my-notifier"` to `notifiers` in [`api/plugins.json`](api/plugins.json).
4. Set any env your plugin needs.
5. Optionally add `ui/index.tsx` exporting a `PluginUiModule` (see [Plugin UI hooks](#plugin-ui-hooks)).
6. Restart / let `npm run dev` reload.

### Write a scheduler

Exactly **one** scheduler in `plugins.json`. Core decides *what* a check does (`run`); the scheduler only decides *when*.

#### Contract

```ts
interface SchedulerContext {
  getTargets(): Array<{ id: number; intervalSeconds: number; enabled: boolean }>
  run(targetId: number): Promise<void> // full check → record → maybe notify
}

interface SchedulerPlugin {
  id: string
  init?(ctx: SchedulerContext): void // store ctx for later
  start(): void                      // begin scheduling (after HTTP listen)
  stop(): void                       // clear timers / unsubscribe
  reschedule(): void                 // required — sync after target CRUD
}
```

A valid scheduler **must** implement all of `start`, `stop`, and `reschedule`. `init` is optional but typical: keep the context and use only `ctx.getTargets()` / `ctx.run(id)`. Do **not** import the pipeline or core write APIs.

#### Lifecycle (what core does)

1. Load the single id from `plugins.json` → `scheduler/<id>/index.ts` (or `scheduler/<id>.ts`).
2. Call `init({ getTargets, run })` if present — `getTargets` closes over core reads.
3. After HTTP listen, call `start()`.
4. On target **create / update / delete** (including Pause/Resume via `enabled`), call `reschedule()` so your schedule matches the DB.

#### What `reschedule` must do

Sync the schedule with `ctx.getTargets()`:

- Stop work for targets that were deleted or disabled.
- Start work for newly created or re-enabled targets.
- Apply `intervalSeconds` changes for affected targets.
- Unchanged enabled targets may keep their existing timers (the reference `interval` plugin does this so Pause on one target does not reset others).

A full tear-down-and-rebuild is also valid; differential updates are preferred when preserving remaining delays matters.

#### `enabled` / Pause behavior

- Only schedule and call `run` for targets with `enabled: true`.
- Before each `run`, re-check `enabled` from `getTargets()` (the DB can change while a timer is pending).
- After Pause, core calls `reschedule()` immediately so future ticks stop for that target.
- An **in-flight** `run` is not cancelled. If disable happens mid-check, that check may still finish; do not schedule another tick afterward if the target is now disabled.

#### Responsibilities

| Do | Don’t |
|----|--------|
| Call `ctx.run(id)` when a target is due | Implement HTTP checks or alerts yourself |
| Honor `enabled` and `intervalSeconds` from `getTargets()` | Assume rows never change without `reschedule` |
| Clear work in `stop()` / on disable | Enable more than one scheduler at once |
| Implement a real `reschedule()` sync | Use multiple schedulers just to vary frequency (use per-target `interval_seconds`) |

Reference: [`api/src/plugins/scheduler/interval/index.ts`](api/src/plugins/scheduler/interval/index.ts) (per-target `setTimeout` chains; differential `reschedule` preserves remaining delays).

#### Enable your scheduler

1. Add `api/src/plugins/scheduler/my-scheduler/index.ts`.
2. Set `"scheduler": "my-scheduler"` in [`api/plugins.json`](api/plugins.json) (replace `interval`).
3. Restart / let `npm run dev` reload.

### Plugin UI hooks

Plugin-specific screens (e.g. FCM token management) belong **in the plugin package**, not under `web/src/pages`.

1. Add `api/src/plugins/<kind>/<id>/ui/index.tsx` that default-exports a `PluginUiModule`:

```ts
import type { PluginUiModule } from '@umpire/plugin-ui'
import TokensPage from './TokensPage'

export default {
  id: 'fcm',
  kind: 'notify',
  path: '/plugins/notify/fcm',
  label: 'FCM tokens',
  Component: TokensPage,
} satisfies PluginUiModule
```

2. The core shell ([`web/src/App.tsx`](web/src/App.tsx)) discovers all `plugins/*/*/ui/index.tsx` via Vite `import.meta.glob`, then shows nav + routes only for plugins currently returned by **`GET /api/plugins`** (i.e. enabled and loaded).
3. Plugin pages import the shared HTTP client as `@umpire/web-api` (alias to [`web/src/api.ts`](web/src/api.ts)).
4. The API TypeScript build excludes `**/ui/**`; the web build typechecks those files.

FCM: UI at `/plugins/notify/fcm`, API at `/api/plugins/notify/fcm/tokens`.

### Core schema

Frozen tables (plugins must not `ALTER` them): `groups`, `targets` (includes `check_ids`, `notifier_ids`), `settings`, `check_results`, `target_state`.

`GET /api/schema` returns the published schema; `GET /api/schema?data=1` includes a JSON dump of those tables. Plugins may **read** via `getCore()`; they should not rely on mutating core tables.

## Alert policies

- **state_change** (default) — notify once when a target goes down, once when it recovers
- **every_fail** — notify on every failed check
- **throttle** — notify on first failure, then at most once per N minutes while still down (and once on recover)

## API

Swagger UI: [http://localhost:8089/documentation](http://localhost:8089/documentation) (or API directly at `:3000/documentation`). OpenAPI JSON: `/documentation/json`.

- `GET/POST/PATCH/DELETE /api/groups` (`GET /api/groups?tree=1` for nested trees)
- `GET/POST/PATCH/DELETE /api/targets` (optional `group_id`, optional `check_ids` / `notifier_ids`; empty allowlist = all of that kind)
- `GET /api/targets/:id/results`
- `GET /api/checks` — loaded check plugins `{ id }`
- `GET /api/notifiers` — loaded notifier plugins `{ id, ready }`
- `GET /api/plugins` — loaded plugins + namespaced HTTP routes
- `GET/POST/PATCH/DELETE /api/plugins/notify/fcm/tokens` — FCM destinations (`target_ids` / `check_ids`); only when `fcm` is enabled
- `GET/PUT /api/settings`
- `GET /api/status`
- `GET /api/schema`
- `GET /api/health`

## Groups and tags

Groups form one or more trees (`parent = 0` is a root). Default tags:

- Root: `group_{id}` (e.g. `group_1`)
- Child: `group_{rootSeg}_{childSeg}_…` (e.g. child `2` under root `1` → `group_group_1_group_2`)

Targets attach to **child** groups via `group_id` (not roots). Deleting a group deletes its subtree and clears `group_id` on affected targets.

## Data

SQLite file: `./data/monitor.sqlite` (bind-mounted in Compose at `/data/monitor.sqlite`). FCM tokens sidecar: `./data/fcm-tokens.json`.

## Notes

- No auth on the UI — bind to localhost or put it behind a VPN/firewall
- Default branch for this repo is `master`
- Docker Compose is optional; prefer host `npm run dev` when writing plugins
