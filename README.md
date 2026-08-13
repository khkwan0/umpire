# Yet Another Monitoring Tool

Standalone monitoring tool with a config UI and pluggable checks, scheduling, storage, and alerts. Ships with an HTTP uptime checker by default, but check plugins can probe anything. Runs on its own host via Docker Compose — not part of any other app.

## What it does

- Periodically runs one or more **check plugins** against each target (default: HTTP GET, 200 = healthy)
- Sends alerts according to a configurable policy via one or more **notifier plugins**
- Stores targets, groups, tokens, settings, and check history via a **store plugin** (default: SQLite)
- Times checks via a **scheduler plugin** (default: per-target intervals)

## Services

| Service | Role |
|---------|------|
| `api` | Fastify API + plugin host (store / check / scheduler / notifiers) |
| `web` | Vite/React UI behind nginx (`/api` proxied to `api`) |

UI default: [http://localhost:8089](http://localhost:8089)

## Quick start

```bash
cp .env.example .env
cp firebase-service-account.json.example firebase-service-account.json
# edit firebase-service-account.json with a real Firebase Admin service account

docker compose up --build -d
```

Open the UI, add a target URL + interval, add an FCM device token (if using the `fcm` notifier), pick an alert policy.

Without valid Firebase credentials the API still runs and checks targets; the FCM notifier reports `ready: false` on the dashboard.

## Plugins

Core owns the check → record → alert-policy → notify pipeline. Plugins implement contracts; core calls their hooks.

Plugins live under `api/src/plugins/<kind>/`:

| Directory | Role |
|-----------|------|
| `available/` | Plugin implementations on disk (shipped or custom) |
| `enabled/` | What is **loaded at boot** — typically symlinks into `available/` |

| Kind | Path | Cardinality |
|------|------|-------------|
| Store | `plugins/store/` | Exactly one in `enabled/` |
| Checks | `plugins/check/` | One or more in `enabled/` — **all** pass → up, **none** → down, **mixed** → partial |
| Scheduler | `plugins/scheduler/` | Exactly one in `enabled/` |
| Notifiers | `plugins/notify/` | Zero or more in `enabled/` — all run on each alert |

You do **not** need multiple schedulers inside a group tree. The `interval` scheduler gives each target its own timer from that target’s `interval_seconds`, so subgroups can already run at different cadences. One scheduler at the process (or, later, per root tree) is enough; only swap the scheduler plugin when the *strategy* changes (e.g. cron vs interval), not to vary frequency.

Defaults enabled out of the box: `sqlite`, `http`, `interval`, `fcm` (symlinks). `webhook` ships in `notify/available/` only — enable it with:

```bash
ln -s ../available/webhook.ts api/src/plugins/notify/enabled/webhook.ts
```

Then set `WEBHOOK_URL` (and optional `WEBHOOK_HEADERS` JSON).

Status payload includes active plugin ids (`checks[]`, `notifiers[]`) and each notifier’s `ready` flag.

### Write a scheduler

Exactly **one** scheduler may be enabled. Core decides *what* a check does (`run`); the scheduler only decides *when*.

#### Contract

Implement `SchedulerPlugin` and export it as `default` (or `plugin`):

```ts
interface SchedulerContext {
  getTargets(): Array<{ id: number; intervalSeconds: number; enabled: boolean }>
  run(targetId: number): Promise<void> // full check → record → maybe notify
}

interface SchedulerPlugin {
  id: string
  init?(ctx: SchedulerContext): void // store ctx for later
  start(): void                      // begin scheduling (called after listen)
  stop(): void                       // clear timers / unsubscribe
  reschedule(): void                 // rebuild after target create/update/delete
}
```

#### Lifecycle (what core does)

1. Load the single module under `scheduler/enabled/`.
2. Call `init({ getTargets, run })` — context functions close over the store and pipeline.
3. After HTTP listen, call `start()`.
4. On target CRUD, call `reschedule()` so your timer map matches the DB.

Your plugin should **not** import the store or pipeline. Use only `ctx.getTargets()` and `ctx.run(id)`.

#### Responsibilities

| Do | Don’t |
|----|--------|
| Call `ctx.run(id)` when a target is due | Implement HTTP checks or alerts |
| Honor `enabled` and `intervalSeconds` from `getTargets()` | Assume target rows never change without `reschedule` |
| Clear work in `stop()` / on disable | Enable more than one scheduler at once |
| Treat `reschedule()` as “tear down and rebuild” | Use multiple schedulers just to vary frequency (use per-target `interval_seconds`) |

Reference implementation: [`api/src/plugins/scheduler/available/interval.ts`](api/src/plugins/scheduler/available/interval.ts) (per-target `setTimeout` chains + startup stagger).

#### Enable your plugin

1. Add `api/src/plugins/scheduler/available/my-scheduler.ts`.
2. Point `enabled/` at it (only one symlink — remove or replace `interval`):

```bash
rm api/src/plugins/scheduler/enabled/interval.ts
ln -s ../available/my-scheduler.ts api/src/plugins/scheduler/enabled/my-scheduler.ts
```

3. Restart the API.

#### Minimal example

Fixed poll: every few seconds, run all enabled targets. (Production usually wants per-target intervals like `interval`; this shows the smallest viable plugin.)

```ts
// api/src/plugins/scheduler/available/fixed-poll.ts
import type { SchedulerContext, SchedulerPlugin } from '../../types.js'

const POLL_MS = 30_000

let ctx: SchedulerContext | undefined
let timer: ReturnType<typeof setInterval> | undefined

async function tick(): Promise<void> {
  if (!ctx) return
  for (const t of ctx.getTargets()) {
    if (!t.enabled) continue
    try {
      await ctx.run(t.id)
    } catch (err) {
      console.error(`[scheduler:fixed-poll] target ${t.id} error`, err)
    }
  }
}

function reschedule(): void {
  // Fixed poll has no per-target timers; next tick picks up DB changes.
  console.log(
    `[scheduler:fixed-poll] ${ctx?.getTargets().filter((t) => t.enabled).length ?? 0} enabled target(s)`,
  )
}

const fixedPoll: SchedulerPlugin = {
  id: 'fixed-poll',

  init(schedulerCtx) {
    ctx = schedulerCtx
  },

  start() {
    if (timer) return
    void tick()
    timer = setInterval(() => void tick(), POLL_MS)
    reschedule()
  },

  stop() {
    if (timer) clearInterval(timer)
    timer = undefined
  },

  reschedule,
}

export default fixedPoll
```

Then:

```bash
rm -f api/src/plugins/scheduler/enabled/interval.ts
ln -s ../available/fixed-poll.ts api/src/plugins/scheduler/enabled/fixed-poll.ts
```

### Write a notifier

1. Add `api/src/plugins/notify/available/my-slack.ts` exporting a `NotifierPlugin` as `default` (or `plugin`).
2. Enable it:

```bash
ln -s ../available/my-slack.ts api/src/plugins/notify/enabled/my-slack.ts
```

3. Restart the API. On alert, core passes a stable `AlertEvent`:

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
Treat `AlertEvent` field names as a stable contract — avoid renaming them casually.

## Alert policies

- **state_change** (default) — notify once when a target goes down, once when it recovers
- **every_fail** — notify on every failed check
- **throttle** — notify on first failure, then at most once per N minutes while still down (and once on recover)

## Local development (without Docker)

Terminal 1 — API:

```bash
cd api
npm install
DATABASE_PATH=../data/monitor.sqlite \
GOOGLE_APPLICATION_CREDENTIALS=../firebase-service-account.json \
npm run dev
```

Terminal 2 — UI (proxies `/api` to `:3000`):

```bash
cd web
npm install
npm run dev
```

## API

Swagger UI: [http://localhost:8089/documentation](http://localhost:8089/documentation) (or API directly at `:3000/documentation`). OpenAPI JSON: `/documentation/json`.

- `GET/POST/PATCH/DELETE /api/groups` (`GET /api/groups?tree=1` for nested trees)
- `GET/POST/PATCH/DELETE /api/targets` (optional `group_id` — must be a **child** group, not a root)
- `GET /api/targets/:id/results`
- `GET/POST/DELETE /api/tokens` (FCM notifier destinations)
- `GET/PUT /api/settings`
- `GET /api/status`
- `GET /api/health`

## Groups and tags

Groups form one or more trees (`parent = 0` is a root). Default tags:

- Root: `group_{id}` (e.g. `group_1`)
- Child: `group_{rootSeg}_{childSeg}_…` (e.g. child `2` under root `1` → `group_group_1_group_2`)

Targets attach to **child** groups via `group_id` (not roots). Deleting a group deletes its subtree and clears `group_id` on affected targets.

## Data

SQLite file lives on the host at `./data/monitor.sqlite` (bind-mounted into the API container at `/data/monitor.sqlite`).

## Notes

- No auth on the UI — bind to localhost or put it behind a VPN/firewall
- Default branch for this repo is `master`
- Loaded external notifier code runs in-process with API privileges — only load trusted modules
