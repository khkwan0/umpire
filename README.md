# UMPIRE

[![CI](https://github.com/khkwan0/umpire/actions/workflows/ci.yml/badge.svg)](https://github.com/khkwan0/umpire/actions/workflows/ci.yml)

**Universal Monitoring Plugin & Incident Reporter** is a **plugin architecture** for monitoring. Core is the host: it stores data, runs the pipeline, and enforces contracts. **Check**, **scheduler**, and **notifier** plugins do the actual probing, timing, and delivery. Swap or add plugins without changing core.

Default process-wide set in [`api/plugins.json`](api/plugins.json): **`http`** check, **`interval`** scheduler, **`fcm`** and **`webhook`** notifiers.

## Plugin architecture

```text
plugins.json     → which modules load (process-wide pool)
targets[]        → what to watch (url, interval, enabled, group)
check_ids        → which loaded checks run for that target ([] = all)
notifier_ids     → which loaded notifiers get alerts ([] = all)
scheduler        → when to call core run(targetId)
core pipeline    → checks → record SQLite → alert policy → notifiers
```

Everything that probes a target, decides *when* to run, or delivers an alert is a plugin. Core never HTTP-checks a URL or sends a push itself.

### Default plugins (by kind)

Enabled out of the box by [`api/plugins.json`](api/plugins.json) (override with `PLUGINS_CONFIG`):

```json
{
  "checks": ["http"],
  "scheduler": "interval",
  "notifiers": ["fcm", "webhook"]
}
```

| Kind | Cardinality | Default | What it does |
|------|-------------|---------|--------------|
| **Check** | One or more | `http` | HTTP check plugin: method, headers, body, accepted status ranges/codes, optional max latency (`CHECK_TIMEOUT_MS`, default 10s) |
| **Scheduler** | **Exactly one** | `interval` | Per-target `interval_seconds` timers; honors Pause |
| **Notifier** | Zero or more | `fcm`, `webhook` | FCM to stored FIDs; HTTP call (GET/POST/PUT/PATCH/…) with `AlertEvent` |

The scheduler is a plugin so timing *can* be replaced, but **leave `interval` in place for almost every deployment**. Per-target frequency is already a core field (`interval_seconds` on each target, including Pause). Write a different scheduler only if you need a different *kind* of clock (cron, business hours, a global tick). You cannot load two schedulers.

Both notifiers load together. Each reports `ready: false` until it is configured in its own UI (FCM FIDs + Firebase credentials; Webhook URL). An unready notifier is skipped on send. On each target, leave check/notifier boxes unchecked to use **all** loaded plugins of that kind, or tick a subset. Empty allowlists are stored as `[]`.

### HTTP check: global defaults and per-target overrides

The **http** check plugin supports two layers of configuration:

1. **Global defaults** — apply to every target unless that target has a custom override. Configure under **Checks → HTTP check** (`/plugins/check/http`). Saved to `data/http-check-defaults.json` next to the SQLite file.

2. **Per-target overrides** — optional settings for one target only. Open **Targets**, find the row, and use **HTTP settings** (`/targets/:id/checks/http`). Enable **Use custom settings for this target** to override method, headers, body, accepted status ranges/codes, and max latency. **Clear override** removes the custom config and the target falls back to globals.

At check time, core resolves **effective config** = global defaults merged with any per-target override. The test button on the override page runs a one-shot check with the current form values without waiting for the scheduler.

**Accepted status** can combine:

- **Ranges** — `1xx`, `2xx`, `3xx`, `4xx`, `5xx` (e.g. default is `2xx` only)
- **Specific codes** — individual HTTP status codes (100–599), e.g. accept `200` and `204` without accepting all of `2xx`

At least one range or specific code is required. Other plugins (e.g. keyword-body) may still use per-target config only; see the plugin guide for their UI paths.

### Plugin manager (runtime enable/disable)

Plugin visibility/behavior now has two layers:

1. **`api/plugins.json` = load list (startup inventory)**  
   If a plugin id is in `plugins.json`, it is loaded by the host at startup and appears in **Settings → Plugin manager**.
2. **Settings plugin-manager flag = runtime enabled state**  
   Loaded plugins can be enabled/disabled live (persisted in `data/plugin-manager.json`) without restart.

For **notifier UI plugins** specifically:

- If listed in `plugins.json` but **disabled** in Settings, they stay loaded but are hidden from the top nav/Notifiers menu and hidden from dashboard notifier widgets.
- After you **enable** them in Settings, they appear in the Notifiers navigation dropdown and their dashboard widgets can render.

In short: `plugins.json` controls what is available to manage; Settings controls what is active/visible at runtime.

**Writing plugins** (contracts, HTTP APIs, UI, dashboard widgets, cookbooks): **[Plugin developer guide](docs/plugins.md)**.

### What core does

Core owns the monitoring **host**, not the implementations:

- **Pipeline** — `run(targetId)`: selected checks → aggregate health → write SQLite → apply alert policy → call selected notifiers
- **Frozen SQLite** — `groups`, `targets` (including `check_ids` / `notifier_ids`), `settings`, `check_results`, `target_state`. Plugins must not `ALTER` these tables. Plugin-owned data (FCM tokens, webhook URL) lives in sidecar files next to the DB and is edited in the plugin UI — not `.env`
- **HTTP API + UI shell** — CRUD for groups, targets, settings, history, status; dashboard (including an outage/recovery log) and nav. Plugin screens, dashboard widgets, and routes are optional add-ons
- **Plugin host** — loads `plugins.json`, mounts plugin HTTP under `/api/plugins/<kind>/<id>/…`, catalogs them at `GET /api/plugins`
- **Alert policy** — decides *whether* to notify (`state_change`, `every_fail`, `throttle`). Notifiers only deliver
- **Allowlists** — empty `check_ids` / `notifier_ids` = all loaded plugins of that kind

### Contracts core guarantees

Source of truth: [`api/src/plugins/types.ts`](api/src/plugins/types.ts). Core calls these hooks; plugins must not import the pipeline or write core tables.

| Kind | Core calls | Core guarantees |
|------|------------|-----------------|
| **Check** | `check(url)` only | Always records an aggregated result. All ok → `up`; all fail → `down`; mix → `partial`. `latency_ms` is the max. Failures are prefixed `[pluginId]` and joined with `; `. Do not throw on a failed probe — return `ok: false`. |
| **Scheduler** | `init` (if any), `start()` after listen, `reschedule()` after every target create/update/delete (including Pause) | Exactly one scheduler. `ctx.run(id)` is the full pipeline. Core does not cancel an in-flight `run` on Pause. Keep shipped `interval` unless you need a different kind of clock. |
| **Notifier** | `notify(event)` when the **policy** says to alert | `AlertEvent` includes `title` / `body` plus per-check `event.checks[]`. Core still calls `notify` when `isReady()` is false (plugin should no-op). Soft skip = return; throw only on hard failure. |

Also guaranteed:

- Plugin HTTP is namespaced; it cannot register core paths like `/api/targets`
- `GET /api/schema` publishes the frozen tables (`?data=1` dumps rows)
- Plugins may **read** core via `getCore()`; they should not mutate core tables
- Only load plugins you trust — they run in-process with API privileges

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

## Scripts

### Root

- `./scripts/deploy.sh` — build and start with Docker Compose, then wait for `/api/health`
- `WEB_PORT=8090 ./scripts/deploy.sh` — deploy and health-check with a custom web port

### API (`api/package.json`)

- `npm run dev` — run API in watch mode
- `npm run build` — compile TypeScript
- `npm run start` — start compiled API from `dist`
- `npm run lint` — run ESLint on API source
- `npm run format` — format API files with Prettier
- `npm run format:check` — verify API formatting
- `npm test` — run API tests
- `npm run test:ci` — run API tests in CI mode + JUnit output
- `npm run test:watch` — run API tests in watch mode

### Web (`web/package.json`)

- `npm run dev` — run Vite dev server
- `npm run build` — typecheck + production build
- `npm run preview` — preview production build locally
- `npm run lint` — run ESLint on web source
- `npm run format` — format web files with Prettier
- `npm run format:check` — verify web formatting

API unit tests:

```bash
cd api && npm test
```

CI locally (same as GitHub Actions / Jenkins API and Web jobs):

```bash
cd api && npm ci && npm run lint && npm run format:check && npm run test:ci && npm run build
cd ../web && npm ci && npm run lint && npm run format:check && npm run build
```

Deploy helper:

```bash
./scripts/deploy.sh
WEB_PORT=8090 ./scripts/deploy.sh
```

Pushes and pull requests run [GitHub Actions](.github/workflows/ci.yml) (current Node LTS). Optional on-host deploy: Jenkins Pipeline in `Jenkinsfile` — [setup](docs/jenkins.md).

Or run with Docker Compose (optional deploy path):

```bash
docker compose up --build -d
```

Open the UI, add a target URL + interval, add an FCM FID and/or a webhook URL, pick an alert policy.

Without Firebase credentials the API still runs and checks targets; FCM reports `ready: false`. Webhook stays `ready: false` until you set a URL on the **Webhook** page.

## Alert policies

- **state_change** (default) — notify once when a target goes down, once when it recovers
- **every_fail** — notify on every failed check
- **throttle** — notify on first failure, then at most once per N minutes while still down (and once on recover)

## API

Swagger UI: [http://localhost:8089/documentation](http://localhost:8089/documentation) (or API directly at `:3000/documentation`). OpenAPI JSON: `/documentation/json`.

- `GET/POST/PATCH/DELETE /api/groups` (`GET /api/groups?tree=1` for nested trees)
- `GET/POST/PATCH/DELETE /api/targets` (optional `group_id`, optional `check_ids` / `notifier_ids`; empty allowlist = all of that kind)
- `GET /api/targets/:id/results`
- `GET /api/incidents` — outage and recovery log (newest first; optional `?limit=`)
- `GET /api/checks` — loaded check plugins `{ id }`
- `GET /api/notifiers` — loaded notifier plugins `{ id, ready }`
- `GET /api/plugins` — loaded plugins + namespaced HTTP routes
- `GET /api/plugin-manager` — runtime plugin enable/disable state
- `PUT /api/plugin-manager/:kind/:id` — toggle a loaded plugin (`kind` = `check` | `notify` | `scheduler`) without restart
- `GET/PUT /api/plugins/check/http/config` — global default HTTP check parameters (`data/http-check-defaults.json`)
- `GET/PUT/DELETE /api/plugins/check/http/targets/:targetId/config` — per-target override (`useCustom` + optional fields merged over defaults); `POST .../test` — one-shot test with effective or form config
- `GET/PUT /api/plugins/check/keyword-body/targets/:targetId/config` — per-target keyword/body check config
- `GET/POST/PATCH/DELETE /api/plugins/notify/fcm/tokens` — FCM destinations (FID preferred; `target_ids` / `check_ids`)
- `POST /api/plugins/notify/fcm/tokens/import` — import `{ fids: [...] }` (or `{ tokens: [...] }`); duplicates skipped
- `POST /api/plugins/notify/fcm/tokens/test` — send a test push to a raw FID or legacy token
- `POST /api/plugins/notify/fcm/tokens/:id/test` — send a test push; FCM success is stored as `sent`, not `ok`
- `POST /api/plugins/notify/fcm/tokens/:id/received` — `{ received: true|false }` confirms on-device result (`false` disables the token)
- `GET/PUT /api/plugins/notify/webhook/config` — webhook URL, HTTP method, and headers
- `POST /api/plugins/notify/webhook/test` — send a sample `AlertEvent` using the saved URL and method
- `GET/PUT /api/plugins/notify/slack/config`, `POST /api/plugins/notify/slack/test` — Slack incoming webhook notifier
- `GET/PUT /api/plugins/notify/discord/config`, `POST /api/plugins/notify/discord/test` — Discord webhook notifier
- `GET/PUT /api/plugins/notify/telegram/config`, `POST /api/plugins/notify/telegram/test` — Telegram bot notifier
- `GET/PUT /api/plugins/notify/email/config`, `POST /api/plugins/notify/email/test` — Email notifier via local `sendmail`
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

SQLite file: `./data/monitor.sqlite` (bind-mounted in Compose at `/data/monitor.sqlite`). Plugin sidecars next to the DB: `./data/http-check-defaults.json`, `./data/fcm-tokens.json`, `./data/webhook.json`, `./data/plugin-manager.json`, and other plugin config files as documented in [docs/plugins.md](docs/plugins.md).

## Notes

- No auth on the UI — bind to localhost or put it behind a VPN/firewall
- Default branch for this repo is `master`
- Docker Compose is optional; prefer host `npm run dev` when writing plugins
- CI: GitHub Actions on push/PR ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). Optional CD: Jenkins — [setup](docs/jenkins.md)
- Dependency updates: Dependabot (`.github/dependabot.yml`) for npm, Docker, and GitHub Actions
- Plugin authoring (API + UI + dashboard widgets): [docs/plugins.md](docs/plugins.md)
