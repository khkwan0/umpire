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

Implementations live under `api/src/plugins/<kind>/available/`. The registry loads each id from that folder (`http.ts`, `fcm.ts`, …).

| Kind | Path | Cardinality |
|------|------|-------------|
| Checks | `plugins/check/available/` | One or more — **all** pass → up, **none** → down, **mixed** → partial |
| Scheduler | `plugins/scheduler/available/` | Exactly one in `plugins.json` |
| Notifiers | `plugins/notify/available/` | Zero or more — all run on each alert |

There is **no store plugin**. Core SQLite is fixed. Extra deps for a custom plugin go in [`api/package.json`](api/package.json) (`cd api && npm install <pkg>`), then list the plugin id in `plugins.json`, then `npm run dev` (`tsx watch` reloads on save).

Only load plugins you wrote or trust — they run in-process with API privileges. There is no in-app dependency installer.

Defaults: `http`, `interval`, `fcm`. Every plugin module must export the plugin as `default` or `plugin`, and its `id` must match the id listed in `plugins.json`.

To enable webhook:

1. Add `"webhook"` to `notifiers` in `plugins.json`.
2. Set `WEBHOOK_URL` (and optional `WEBHOOK_HEADERS` JSON).
3. Restart / let `npm run dev` reload.

### Write a check

One or more checks in `plugins.json`. For each target run, core selects which checks to invoke from that target’s **`check_ids` allowlist**, runs them in parallel against the target URL, aggregates outcomes, records the result, then maybe alerts. A check plugin only answers “is this URL ok?” for its probe type.

#### Per-target allowlist (`check_ids`)

| `check_ids` on target | Behavior |
|-----------------------|----------|
| `[]` (default) | Run **all** loaded check plugins |
| `["http", …]` | Run only those plugin ids that are both listed **and** currently loaded |

Unknown ids in the list are kept (so enabling that check later works) but ignored at run time. If the list is non-empty and **none** of the listed checks are loaded, the run is recorded as `down` with an explanatory error (not treated as success).

Set via `POST`/`PATCH /api/targets` (`check_ids`) or the Targets UI checkboxes (unchecked = all). List loaded plugins with `GET /api/checks`.

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

1. Load each id from `plugins.json` → `check/available/<id>.ts`.
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

Reference: [`api/src/plugins/check/available/http.ts`](api/src/plugins/check/available/http.ts) (HTTP GET, 200 = healthy, `CHECK_TIMEOUT_MS`).

#### Enable your check

1. Add `api/src/plugins/check/available/my-check.ts`.
2. Add `"my-check"` to the `checks` array in [`api/plugins.json`](api/plugins.json) (keep or remove `http` as you prefer).
3. Restart / let `npm run dev` reload.
4. Optionally restrict which targets use it via `check_ids` on those targets (Targets UI or API).

### Write a notifier

Zero or more notifiers in `plugins.json`. When the alert policy says an alert is needed, core calls **every** enabled notifier with the same `AlertEvent`. Notifiers deliver the alert; they do not decide *whether* to alert.

#### Contract

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
}

interface NotifierPlugin {
  id: string
  init?(): void | Promise<void>
  isReady(): boolean
  notify(event: AlertEvent): Promise<void>
}
```

A valid notifier **must** implement `isReady` and `notify`. `init` is optional but typical (read env, connect, load plugin-owned data). Export as `default` or `plugin`. Treat `AlertEvent` field names as a stable contract.

#### Lifecycle (what core does)

1. Load each id from `plugins.json` → `notify/available/<id>.ts`.
2. Call `init()` if present (failures are logged; other notifiers still load).
3. On each alert, core runs all notifiers with `Promise.allSettled` (one failure does not block the others).
4. If **at least one** `notify` fulfills, core calls `markAlertSent` for throttle / policy bookkeeping.
5. Status / dashboard exposes each notifier’s `id` and `isReady()` as `ready`.

#### `isReady` and `notify`

- `isReady()` should reflect whether the notifier can actually send (credentials present, URL configured, etc.). It is surfaced on the dashboard; core does **not** skip `notify` solely because `ready` is false — your `notify` should no-op or warn if not ready.
- `notify` should throw only on hard failure if you want that attempt counted as rejected for `markAlertSent`. Soft skip (not configured) should return without throwing.
- Non-core destinations (FCM tokens, Slack webhooks beyond env, etc.) are **owned by the notifier** — not core SQLite. FCM uses `data/fcm-tokens.json` (`FCM_TOKENS_PATH` overrides the full file path). `/api/tokens` is FCM-specific and returns 404 unless `fcm` is enabled.

#### Responsibilities

| Do | Don’t |
|----|--------|
| Deliver `title` / `body` (and any extra fields you need from `AlertEvent`) | Decide alert policy (core already did) |
| Own your config and destination storage | Write `check_results` / `target_state` |
| Implement honest `isReady()` | Assume you are the only notifier |
| Keep secrets in env or plugin-owned files | Put notifier-specific tables into core |

References:

- [`api/src/plugins/notify/available/fcm.ts`](api/src/plugins/notify/available/fcm.ts) + [`fcm-tokens.ts`](api/src/plugins/notify/available/fcm-tokens.ts)
- [`api/src/plugins/notify/available/webhook.ts`](api/src/plugins/notify/available/webhook.ts) (`WEBHOOK_URL`, optional `WEBHOOK_HEADERS`)

#### Enable your notifier

1. Add `api/src/plugins/notify/available/my-notifier.ts`.
2. If you need a package (e.g. `pg`): `cd api && npm install pg`.
3. Add `"my-notifier"` to `notifiers` in [`api/plugins.json`](api/plugins.json).
4. Set any env your plugin needs.
5. Restart / let `npm run dev` reload.

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

1. Load the single id from `plugins.json` → `scheduler/available/<id>.ts`.
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

Reference: [`api/src/plugins/scheduler/available/interval.ts`](api/src/plugins/scheduler/available/interval.ts) (per-target `setTimeout` chains; differential `reschedule` preserves remaining delays).

#### Enable your scheduler

1. Add `api/src/plugins/scheduler/available/my-scheduler.ts`.
2. Set `"scheduler": "my-scheduler"` in [`api/plugins.json`](api/plugins.json) (replace `interval`).
3. Restart / let `npm run dev` reload.

### Core schema

Frozen tables (plugins must not `ALTER` them): `groups`, `targets` (includes `check_ids`), `settings`, `check_results`, `target_state`.

`GET /api/schema` returns the published schema; `GET /api/schema?data=1` includes a JSON dump of those tables. Plugins may **read** via `getCore()`; they should not rely on mutating core tables.

## Alert policies

- **state_change** (default) — notify once when a target goes down, once when it recovers
- **every_fail** — notify on every failed check
- **throttle** — notify on first failure, then at most once per N minutes while still down (and once on recover)

## API

Swagger UI: [http://localhost:8089/documentation](http://localhost:8089/documentation) (or API directly at `:3000/documentation`). OpenAPI JSON: `/documentation/json`.

- `GET/POST/PATCH/DELETE /api/groups` (`GET /api/groups?tree=1` for nested trees)
- `GET/POST/PATCH/DELETE /api/targets` (optional `group_id`, optional `check_ids`; empty `check_ids` = all checks)
- `GET /api/targets/:id/results`
- `GET /api/checks` (loaded check plugin ids)
- `GET/POST/DELETE /api/tokens` (FCM destinations; 404 if fcm disabled)
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
