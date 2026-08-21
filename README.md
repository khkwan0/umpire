# UMPIRE

[![CI](https://github.com/khkwan0/umpire/actions/workflows/ci.yml/badge.svg)](https://github.com/khkwan0/umpire/actions/workflows/ci.yml)

**Universal Monitoring Plugin & Incident Reporter** — monitoring you can stand up in minutes and grow without rewriting the host.

Add a target, pick how often to check it, and get alerts when something fails. Defaults work out of the box: HTTP checks on an interval, webhook notifications when you point them at a URL. The UI covers day-to-day ops (targets, groups, pause, history, settings).

When you need more — ping, TLS, Slack, FCM, a custom probe — you extend Umpire through a **developer-friendly plugin system**. Core stays a small host (storage, pipeline, contracts). **Check**, **scheduler**, and **notifier** plugins do the probing, timing, and delivery. Add or swap plugins without changing core; cookbooks live in the [plugin](docs/plugins.md) and [core](docs/core.md) guides.

Default process-wide set in [`api/plugins.json`](api/plugins.json) + [`data/plugin-manager.json`](data/plugin-manager.json): **`http`** check, **`interval`** scheduler, **`webhook`** notifier. Other shipped notifiers (FCM, Slack, …) load but stay off until you enable them in **Settings → Plugin manager**.

## Getting started

To run the stack locally (deploy script or Docker Compose), see **[Run locally](#run-locally)**. One script builds and starts API + UI; open the dashboard and add a target.

## Plugin architecture

```text
plugins/                 → check / notify / scheduler implementations
api/plugins.json         → which of those modules load (process-wide pool)
data/plugin-manager.json → which loaded plugins are enabled at runtime
targets[]                → what to watch (url, interval, enabled, group)
check_ids                → which enabled checks run for that target ([] = all enabled)
notifier_ids             → which enabled notifiers get alerts ([] = all enabled)
scheduler                → when to call core run(targetId)
core pipeline            → checks → record SQLite → alert policy → notifiers
```

Everything that probes a target, decides *when* to run, or delivers an alert is a plugin. Core never HTTP-checks a URL or sends a push itself.

Implementations live in [`plugins/`](plugins/) at the repo root. The API **host** (contracts, loader, enable/disable) stays in [`api/src/plugins/`](api/src/plugins/). See [`plugins/README.md`](plugins/README.md).

### Default plugins (by kind)

Enabled out of the box (`http` check, `interval` scheduler, `webhook` notifier):

```json
{
  "checks": ["http"],
  "scheduler": "interval",
  "notifiers": ["webhook"]
}
```

| Kind | Cardinality | Default | What it does |
|------|-------------|---------|--------------|
| **Check** | One or more | `http` | HTTP check plugin: method, headers, body, accepted status ranges/codes, optional max latency (`CHECK_TIMEOUT_MS`, default 10s) |
| **Scheduler** | **Exactly one** | `interval` | Per-target `interval_seconds` timers; honors Pause |
| **Notifier** | Zero or more | `webhook` | HTTP call (GET/POST/PUT/PATCH/…) with `AlertEvent` |

The scheduler is a plugin so timing *can* be replaced, but **leave `interval` in place for almost every deployment**. Per-target frequency is already a core field (`interval_seconds` on each target, including Pause). Write a different scheduler only if you need a different *kind* of clock (cron, business hours, a global tick). You cannot load two schedulers.

The default notifier is **webhook**. It reports `ready: false` until you set a URL on the **Webhook** page. Other loaded notifiers (FCM, Slack, Telegram, Discord, email) stay disabled until you turn them on in **Settings → Plugin manager**. On each target, leave check/notifier boxes unchecked to use **all enabled** plugins of that kind, or tick a subset. Empty allowlists are stored as `[]`.

### HTTP check: global defaults and per-target overrides

The **http** check plugin supports two layers of configuration:

1. **Global defaults** — apply to every target unless that target has a custom override. Configure under **Checks → HTTP check** (`/plugins/check/http`). Saved to `data/http-check-defaults.json` next to the SQLite file.

2. **Per-target overrides** — optional settings for one target only. Open **Targets**, find the row, and use **HTTP settings** (`/targets/:id/checks/http`). Targets with an override show a **custom** badge next to that link. Enable **Use custom settings for this target** to override method, headers, body, accepted status ranges/codes, and max latency. **Clear override** removes the custom config and the target falls back to globals.

At check time, core resolves **effective config** = global defaults merged with any per-target override. The test button on the override page runs a one-shot check with the current form values without waiting for the scheduler.

**Accepted status** can combine:

- **Ranges** — `1xx`, `2xx`, `3xx`, `4xx`, `5xx` (e.g. default is `2xx` only)
- **Specific codes** — individual HTTP status codes (100–599), e.g. accept `200` and `204` without accepting all of `2xx`

At least one range or specific code is required. Other plugins (e.g. keyword-body) may still use per-target config only; see the plugin guide for their UI paths.

### Notifier defaults and per-target overrides

File-backed notifiers (**webhook**, **slack**, **discord**, **telegram**, **email**) follow the same pattern as HTTP checks:

1. **Global defaults** — configure under **Notifiers → &lt;plugin&gt;** (`/plugins/notify/<id>`). Saved to sidecar JSON next to the SQLite file (`webhook.json`, `slack.json`, etc.).

2. **Per-target overrides** — optional delivery settings for one target. On **Targets**, use **&lt;notifier&gt; settings** (`/targets/:id/notifiers/:notifierId`). Enable **Use custom settings for this target** to override plugin-specific destinations (URL, chat ID, email recipients, FCM device list, etc.). **Clear override** removes the custom config.

**Check allowlist (core)** — every loaded notifier automatically gets an optional **Checks** allowlist on **Targets → &lt;notifier&gt; settings**. It is owned by core (`GET/PUT /api/targets/:id/notifiers/:notifierId/check-ids`), not by plugin code. Empty = any alert (including recovery); non-empty = only when a listed check failed (recoveries skipped). Core applies it in the pipeline before calling `notify()`.

At alert time, each notifier resolves **effective plugin config** = global defaults merged with any per-target override. Core then filters on `check_ids` before delivery.

**FCM** (optional) stores the Admin SDK service account in `data/fcm-service-account.json` and device FIDs on the FCM page (`fcm-tokens.json`). Enable it in **Settings → Plugin manager**, then configure destinations. See [`plugins/notify/fcm/README.md`](plugins/notify/fcm/README.md). Per-target **destination** allowlists (`token_ids`) are on **Targets → fcm settings** when using custom settings.

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

**Writing plugins** (contracts, HTTP APIs, UI, dashboard widgets, cookbooks): **[Plugin developer guide](docs/plugins.md)**. **Changing core** (pipeline, schema, host APIs): **[Core developer guide](docs/core.md)**.

### What core does

Core owns the monitoring **host**, not the implementations:

- **Pipeline** — `run(targetId)`: selected checks → aggregate health → write SQLite → apply alert policy → call selected notifiers
- **Frozen SQLite** — `groups`, `targets` (including `check_ids` / `notifier_ids`), `settings`, `check_results`, `target_state`, plus override tables `target_check_configs` / `target_notifier_configs`. Plugins must not `ALTER` these tables. Plugin-owned data (FCM tokens and service account, webhook URL) lives in sidecar files next to the DB and is edited in the plugin UI — not `.env`
- **HTTP API + UI shell** — CRUD for groups, targets, settings, history, status; dashboard (including an outage/recovery log) and nav. Plugin screens, dashboard widgets, and routes are optional add-ons
- **Plugin host** — loads modules from [`plugins/`](plugins/) listed in `plugins.json`, mounts plugin HTTP under `/api/plugins/<kind>/<id>/…`, catalogs them at `GET /api/plugins`
- **Alert policy** — decides *whether* to notify (`state_change`, `every_fail`, `throttle`). Notifiers only deliver
- **Allowlists** — empty `check_ids` / `notifier_ids` = all **enabled** plugins of that kind

### Contracts core guarantees

Source of truth: [`api/src/plugins/types.ts`](api/src/plugins/types.ts). Core calls these hooks; plugins must not import the pipeline or write core tables.

| Kind | Core calls | Core guarantees |
|------|------------|-----------------|
| **Check** | `check(url)` only | Always records an aggregated result. All ok → `up`; all fail → `down`; mix → `partial`. `latency_ms` is the max. Failures are prefixed `[pluginId]` and joined with `; `. Do not throw on a failed probe — return `ok: false`. |
| **Scheduler** | `init` (if any), `start()` after listen, `reschedule()` after every target create/update/delete (including Pause) | Exactly one scheduler. `ctx.run(id)` is the full pipeline. Core does not cancel an in-flight `run` on Pause. Keep shipped `interval` unless you need a different kind of clock. |
| **Notifier** | `notify(ctx)` when the **policy** says to alert | `AlertEvent` includes `title` / `body` plus per-check `event.checks[]`. Per-target override JSON is passed as `ctx.config`. Core applies per-notifier `check_ids` from `ctx.config` before calling `notify()` (empty = any alert). Core still calls `notify` when `isReady()` is false (plugin should no-op). Soft skip = return; throw only on hard failure. |

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

## Repo layout

```text
plugins/          implementations (check / notify / scheduler)
api/src/plugins/  host only (types, loader, manager, route namespace)
api/plugins.json  which implementations load
web/              UI shell; globs plugins/*/*/ui at build time
data/             SQLite + plugin sidecar JSON (not in git)
docs/             plugin guide, core guide, Jenkins
```

Do not confuse filesystem `plugins/` with HTTP `/api/plugins/<kind>/<id>/…` (the host namespace).

## Run locally

Two ways to run the full stack (API + UI). Both build from the **repo root** so Docker can copy [`plugins/`](plugins/).

### Deploy script (recommended)

[`scripts/deploy.sh`](scripts/deploy.sh) copies `.env` from [`.env.example`](.env.example) if needed, formats API and web sources, runs `docker compose up -d --build`, then waits for `/api/health`:

```bash
./scripts/deploy.sh
```

UI: [http://localhost:8089](http://localhost:8089). Custom host port:

```bash
WEB_PORT=8090 ./scripts/deploy.sh
```

(`WEB_PORT` is read from `.env` for Compose; the script also uses it for the health-check URL.)

### Public URL path (`BASE_PATH`)

`BASE_PATH` is the public URL prefix where the UI is served. It must match the path users open in the browser.

| How you host | `BASE_PATH` |
|--------------|-------------|
| `http://localhost:8089/` or `https://example.com/` | `/` (default) |
| `https://example.com/umpire` | `/umpire` |

If the browser path is `/umpire` but the image was built for `/`, the HTML still requests `/assets/...` at the domain root. Those requests 404 and the page stays blank.

Set it in `.env` (copied from [`.env.example`](.env.example)) or pass it on the command line:

```bash
BASE_PATH=/umpire ./scripts/deploy.sh
# or
BASE_PATH=/umpire docker compose up -d --build
```

Asset URLs, React Router’s basename, API/SSE fetches, and the web container’s nginx rewrite are baked into the **web image** at build time. Changing `BASE_PATH` requires a rebuild (`--build`), not only a container restart.

Your reverse proxy can either forward `/umpire/...` as-is or strip the prefix before proxying; the web container accepts both when built with that `BASE_PATH`. Local health checks stay on the published port without the prefix: `http://127.0.0.1:8089/api/health`.

### Docker Compose

Same images and volumes, without the format step or health wait:

```bash
cp .env.example .env   # skip if you already have .env
docker compose up --build -d
```

Stop with `docker compose down`. Data stays in `./data`.

Then open the UI, add a target URL + interval, set a webhook URL, pick an alert policy. Webhook stays `ready: false` until you set a URL on the **Webhook** page. FCM is off by default; enable it in **Settings → Plugin manager** and add `data/fcm-service-account.json` if you want push delivery.

### `npm run dev` (writing plugins or core)

The two-process Node path is for **development** (hot reload, no image rebuild). It is not the local deploy path — use the script or Compose above to run the packaged stack.

```bash
cp .env.example .env

cd api && npm install && \
  DATABASE_PATH=../data/monitor.sqlite \
  npm run dev
```

In another terminal:

```bash
cd web && npm install && npm run dev
```

Vite serves the UI on [http://localhost:8089](http://localhost:8089) (same host port as Compose; `strictPort` so it will not silently pick another). Stop Compose first if 8089 is already bound. `/api` is proxied to the API on port 3000. Details: [CONTRIBUTING.md](CONTRIBUTING.md).

## Scripts

### Root

- `./scripts/deploy.sh` — build and start with Docker Compose, then wait for `/api/health`
- `WEB_PORT=8090 ./scripts/deploy.sh` — deploy and health-check with a custom web port
- `BASE_PATH=/umpire ./scripts/deploy.sh` — bake a subdirectory public path into the web image

### API (`api/package.json`)

- `npm run dev` — run API in watch mode
- `npm run build` — compile TypeScript (`api/src` + repo `plugins/`)
- `npm run start` — start compiled API from `dist`
- `npm run lint` — run ESLint on `api/src` (plugin implementations are formatted/tested, not linted from this script)
- `npm run format` — format API + `plugins/**/*.ts` with Prettier
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

Pushes and pull requests run [GitHub Actions](.github/workflows/ci.yml) (current Node LTS). Optional on-host deploy: Jenkins Pipeline in `Jenkinsfile` — [setup](docs/jenkins.md).

## Alert policies

- **state_change** (default) — notify once when a target goes down, once when it recovers
- **every_fail** — notify on every failed check
- **throttle** — notify on first failure, then at most once per N minutes while still down (and once on recover)

## API

Swagger UI: [http://localhost:8089/documentation](http://localhost:8089/documentation) (or API directly at `:3000/documentation`). OpenAPI JSON: `/documentation/json`.

- `GET/POST/PATCH/DELETE /api/groups` (`GET /api/groups?tree=1` for nested trees)
- `GET/POST/PATCH/DELETE /api/targets` (optional `group_id`, optional `check_ids` / `notifier_ids`; empty allowlist = all **enabled** of that kind)
- `GET /api/notifiers/check-ids` — which targets have a per-notifier override (check allowlist and/or custom plugin settings)
- `GET/PUT /api/targets/:id/notifiers/:notifierId/check-ids` — core check allowlist for one target + notifier
- `GET /api/targets/:id/results`
- `GET /api/incidents` — outage and recovery log (newest first; optional `?limit=`)
- `GET /api/checks` — loaded check plugins `{ id }` (pipeline still skips disabled ones)
- `GET /api/notifiers` — loaded notifier plugins `{ id, ready }` (pipeline still skips disabled ones)
- `GET /api/plugins` — loaded plugins + namespaced HTTP routes
- `GET /api/plugin-manager` — runtime plugin enable/disable state
- `PUT /api/plugin-manager/:kind/:id` — toggle a loaded plugin (`kind` = `check` | `notify` | `scheduler`) without restart
- `GET/PUT /api/plugins/check/http/config` — global default HTTP check parameters (`data/http-check-defaults.json`)
- `GET /api/plugins/check/http/overrides` — `{ targetIds }` for targets with a custom HTTP override
- `GET/PUT/DELETE /api/plugins/check/http/targets/:targetId/config` — per-target override (`useCustom` + optional fields merged over defaults); `POST .../test` — one-shot test with effective or form config
- `GET/PUT /api/plugins/check/keyword-body/targets/:targetId/config` — per-target keyword/body check config
- `GET/POST/PATCH/DELETE /api/plugins/notify/fcm/tokens` — FCM FID destinations
- `POST /api/plugins/notify/fcm/tokens/import` — import `{ fids: [...] }`; duplicates skipped
- `POST /api/plugins/notify/fcm/tokens/test` — send a test push to a raw FID
- `POST /api/plugins/notify/fcm/tokens/:id/test` — send a test push; FCM success is stored as `sent`, not `ok`
- `POST /api/plugins/notify/fcm/tokens/:id/received` — `{ received: true|false }` confirms on-device result (`false` disables the destination)
- `GET/PUT/DELETE /api/plugins/notify/fcm/targets/:targetId/config` — per-target FCM routing override
- `GET/PUT /api/plugins/notify/webhook/config` — default webhook notifier parameters
- `GET /api/plugins/notify/webhook/overrides`, `GET/PUT/DELETE /api/plugins/notify/webhook/targets/:targetId/config`, `POST .../test` — per-target webhook override
- Same `/overrides` + `/targets/:targetId/config` + `/test` pattern for **slack**, **discord**, **telegram**, **email**
- `GET/PUT /api/plugins/notify/slack/config`, `POST /api/plugins/notify/slack/test` — Slack defaults + test
- `GET/PUT /api/plugins/notify/discord/config`, `POST /api/plugins/notify/discord/test` — Discord defaults + test
- `GET/PUT /api/plugins/notify/telegram/config`, `POST /api/plugins/notify/telegram/test` — Telegram defaults + test
- `GET/PUT /api/plugins/notify/email/config`, `POST /api/plugins/notify/email/test` — Email defaults + test
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

SQLite file: `./data/monitor.sqlite` (bind-mounted in Compose at `/data/monitor.sqlite`). Plugin sidecars next to the DB: `./data/http-check-defaults.json`, `./data/webhook.json`, `./data/slack.json`, `./data/fcm-tokens.json`, `./data/fcm-service-account.json`, `./data/plugin-manager.json`, and other plugin config files as documented in [docs/plugins.md](docs/plugins.md). Per-target check and notifier overrides are stored in SQLite (`target_check_configs`, `target_notifier_configs`).

## Notes

- No auth on the UI — bind to localhost or put it behind a VPN/firewall
- Default branch for this repo is `master`
- Local run: [`./scripts/deploy.sh`](scripts/deploy.sh) or `docker compose up --build -d` (repo-root build context). Use host `npm run dev` only when writing plugins or core — [CONTRIBUTING.md](CONTRIBUTING.md)
- CI: GitHub Actions on push/PR ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). Optional CD: Jenkins — [setup](docs/jenkins.md)
- Dependency updates: Dependabot (`.github/dependabot.yml`) for npm, Docker, and GitHub Actions
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Plugin authoring (API + UI + dashboard widgets): [docs/plugins.md](docs/plugins.md) — implementations live in [`plugins/`](plugins/)
- Core host (pipeline, schema, plugin host, UI shell): [docs/core.md](docs/core.md)
