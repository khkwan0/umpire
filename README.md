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

Open the UI, add a target URL + interval, add an FCM FID (if using the `fcm` notifier), pick an alert policy.

Without valid Firebase credentials the API still runs and checks targets; the FCM notifier reports `ready: false` on the dashboard.

## Plugins

Core owns the check → record → alert-policy → notify pipeline and the frozen SQLite tables. Plugins implement contracts; core calls their hooks.

Enable shipped plugins in [`api/plugins.json`](api/plugins.json) (or set `PLUGINS_CONFIG`):

```json
{
  "checks": ["http"],
  "scheduler": "interval",
  "notifiers": ["fcm"]
}
```

| Kind | Shipped | Cardinality |
|------|---------|-------------|
| Checks | `http` | One or more |
| Scheduler | `interval` | Exactly one |
| Notifiers | `fcm`, `webhook` | Zero or more |

On each target, leave check/notifier boxes unchecked to use **all** loaded plugins of that kind, or tick a subset. Empty allowlists are stored as `[]`.

To enable **webhook** (no FCM): add `"webhook"` to `notifiers`, set `WEBHOOK_URL` (optional `WEBHOOK_HEADERS` JSON), restart.

**Writing plugins** (contracts, HTTP APIs, UI, hello-world and real-world cookbooks): **[Plugin developer guide](docs/plugins.md)**.

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
- `GET/POST/PATCH/DELETE /api/plugins/notify/fcm/tokens` — FCM destinations (FID preferred; `target_ids` / `check_ids`); only when `fcm` is enabled
- `POST /api/plugins/notify/fcm/tokens/import` — import `{ fids: [...] }` (or `{ tokens: [...] }`); duplicates skipped
- `POST /api/plugins/notify/fcm/tokens/test` — send a test push to a raw FID or legacy token
- `POST /api/plugins/notify/fcm/tokens/:id/test` — send a test push; FCM success is stored as `sent`, not `ok`
- `POST /api/plugins/notify/fcm/tokens/:id/received` — `{ received: true|false }` confirms on-device result (`false` disables the token)
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
- Plugin authoring (API + UI cookbook): [docs/plugins.md](docs/plugins.md)
