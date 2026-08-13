# Yet Another Monitoring Tool

Standalone monitoring tool with a config UI and pluggable checks, scheduling, and alerts. Core stores monitoring data in SQLite. Ships with an HTTP uptime checker by default; check plugins can probe anything.

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

Defaults: `http`, `interval`, `fcm`. To enable webhook:

1. Add `"webhook"` to `notifiers` in `plugins.json`.
2. Set `WEBHOOK_URL` (and optional `WEBHOOK_HEADERS` JSON).
3. Restart / let `npm run dev` reload.

### Write a notifier (happy path)

1. Add `api/src/plugins/notify/available/my-notifier.ts` exporting a `NotifierPlugin` as `default` (or `plugin`).
2. If you need a package (e.g. `pg`): `cd api && npm install pg`.
3. Add `"my-notifier"` to `notifiers` in `plugins.json`.
4. Set any env your plugin needs.
5. `npm run dev`.

On alert, core passes a stable `AlertEvent`:

```ts
{
  target: { id: number; url: string }
  status: 'down' | 'up' | 'partial'
  previousStatus: 'down' | 'up' | 'partial' | 'unknown'
  error: string | null
  statusCode: number | null
  checkedAt: string
  title: string
  body: string
}
```

`is_up` / check result `ok` encoding: `1` = up, `0` = down, `2` = partial.

Non-core data (tokens, webhook secrets beyond env, etc.) should be owned by the plugin. FCM tokens live in `data/fcm-tokens.json` (override with `FCM_TOKENS_PATH`). `/api/tokens` returns 404 unless `fcm` is enabled.

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

Frozen tables (plugins must not `ALTER` them): `groups`, `targets`, `settings`, `check_results`, `target_state`.

`GET /api/schema` returns the published schema; `GET /api/schema?data=1` includes a JSON dump of those tables. Plugins may **read** via `getCore()`; they should not rely on mutating core tables.

## Alert policies

- **state_change** (default) — notify once when a target goes down, once when it recovers
- **every_fail** — notify on every failed check
- **throttle** — notify on first failure, then at most once per N minutes while still down (and once on recover)

## API

Swagger UI: [http://localhost:8089/documentation](http://localhost:8089/documentation) (or API directly at `:3000/documentation`). OpenAPI JSON: `/documentation/json`.

- `GET/POST/PATCH/DELETE /api/groups` (`GET /api/groups?tree=1` for nested trees)
- `GET/POST/PATCH/DELETE /api/targets` (optional `group_id` — must be a **child** group, not a root)
- `GET /api/targets/:id/results`
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
