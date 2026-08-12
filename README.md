# Yet Another Monitoring Tool

Standalone HTTP uptime monitor with a config UI and pluggable alerts. Runs on its own host via Docker Compose — not part of any other app.

## What it does

- Periodically checks each configured URL (default: HTTP GET, 200 = healthy)
- Sends alerts according to a configurable policy via one or more **notifier plugins**
- Stores targets, tokens, settings, and check history via a **store plugin** (default: SQLite)

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

Without valid Firebase credentials the API still runs and checks URLs; the FCM notifier reports `ready: false` on the dashboard.

## Plugins

Core owns the check → record → alert-policy → notify pipeline. Plugins implement contracts; core calls their hooks.

| Kind | Env | Default | Notes |
|------|-----|---------|-------|
| Store | `STORE_PLUGIN` | `sqlite` | One active |
| Check | `CHECK_PLUGIN` | `http` | One active |
| Scheduler | `SCHEDULER_PLUGIN` | `interval` | One active (per-target timers) |
| Notifiers | `NOTIFY_PLUGINS` | `fcm` | **Many** — comma list, all run on each alert |

Examples:

```bash
NOTIFY_PLUGINS=fcm,webhook
WEBHOOK_URL=https://example.com/hooks/yamt
# optional JSON object of extra headers:
# WEBHOOK_HEADERS={"Authorization":"Bearer secret"}
```

Status payload includes active plugin ids and each notifier’s `ready` flag.

### Write a notifier

Implement the core `NotifierPlugin` contract (`id`, `isReady()`, `notify(event)`). Built-ins live under `api/src/plugins/notify/`. External modules can be loaded by path or package name in `NOTIFY_PLUGINS`:

```bash
NOTIFY_PLUGINS=fcm,./plugins/my-slack.js
```

The module must export a `NotifierPlugin` (or a factory that returns one) as `default`, `plugin`, or `notifier`. On alert, core passes a stable `AlertEvent`:

```ts
{
  target: { id: number; url: string }
  status: 'down' | 'up'
  previousStatus: 'down' | 'up' | 'unknown'
  error: string | null
  statusCode: number | null
  checkedAt: string
  title: string
  body: string
}
```

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
NOTIFY_PLUGINS=fcm \
npm run dev
```

Terminal 2 — UI (proxies `/api` to `:3000`):

```bash
cd web
npm install
npm run dev
```

## API

- `GET/POST/PATCH/DELETE /api/targets`
- `GET /api/targets/:id/results`
- `GET/POST/DELETE /api/tokens` (FCM notifier destinations)
- `GET/PUT /api/settings`
- `GET /api/status`
- `GET /api/health`

## Data

SQLite file lives on the host at `./data/monitor.sqlite` (bind-mounted into the API container at `/data/monitor.sqlite`).

## Notes

- No auth on the UI — bind to localhost or put it behind a VPN/firewall
- Default branch for this repo is `master`
- Loaded external notifier code runs in-process with API privileges — only load trusted modules
