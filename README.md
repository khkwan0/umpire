# UMPIRE

[![CI](https://github.com/khkwan0/umpire/actions/workflows/ci.yml/badge.svg)](https://github.com/khkwan0/umpire/actions/workflows/ci.yml)

**Universal Monitoring Plugin & Incident Reporter** — monitoring you can stand up in minutes and grow without rewriting the host.

Add a target, pick how often to check it, and get alerts when something fails. Defaults work out of the box: HTTP checks on an interval, webhook notifications when you point them at a URL. The UI covers day-to-day ops (targets, groups, pause, history, settings).

When you need more — ping, TLS, Slack, FCM, a custom probe — you extend Umpire through a **developer-friendly plugin system**. Core stays a small host (storage, pipeline, contracts). **Check**, **scheduler**, and **notifier** plugins do the probing, timing, and delivery. Add or swap plugins without changing core; cookbooks live in the [plugin](docs/plugins.md) and [core](docs/core.md) guides.

Default process-wide set in [`api/plugins.json`](api/plugins.json) + [`data/plugin-manager.json`](data/plugin-manager.json): **`http`** check, **`interval`** scheduler, **`webhook`** notifier. Other shipped notifiers (FCM, Slack, …) load but stay off until you enable them in **Settings → Plugin manager**.

## Getting started

**Deploy from Docker Hub** (no build): see **[docs/deployment.md](docs/deployment.md)** — pull `nitroxstudios/umpire-api` + `nitroxstudios/umpire-web` with [`docker-compose.hub.yml`](docker-compose.hub.yml).

**Run from source** (deploy script or Docker Compose): see **[Run locally](#run-locally)**. The default path starts **API + web**; open the dashboard and add a target. For headless deployments, only the **API** is required — see **[API only](#api-only-headless)**.

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

UMPIRE ships as two Docker images. **Only the API is required** for monitoring — checks, scheduling, SQLite storage, and alert delivery all run there. The web image is **optional but recommended** for day-to-day use.

| Service | Required? | Role |
|---------|-----------|------|
| `api` | **Yes** | HTTP API, SQLite, plugin host (checks / scheduler / notifiers) |
| `web` | No (suggested) | React UI behind nginx (`/api` proxied to `api`) |

Without `web`, configure targets and notifiers via the REST API ([API](#api) below), [MCP](mcp/README.md), or curl. You lose the dashboard, in-browser plugin settings pages, and the built-in agent chat UI (the API endpoints for agents still work).

When both services run (default Compose / deploy script), the UI is at [http://localhost:8089](http://localhost:8089).

## Repo layout

```text
plugins/          implementations (check / notify / scheduler)
api/src/plugins/  host only (types, loader, manager, route namespace)
api/plugins.json  which implementations load
web/              UI shell; globs plugins/*/*/ui at build time
data/             SQLite + plugin sidecar JSON (not in git)
docs/             plugin guide, core guide, agents, Jenkins
```

Do not confuse filesystem `plugins/` with HTTP `/api/plugins/<kind>/<id>/…` (the host namespace).

## Deploy from Docker Hub

Pre-built images:

| Image | Purpose |
|-------|---------|
| `nitroxstudios/umpire-api` | API — **required** for monitoring |
| `nitroxstudios/umpire-web` | Dashboard — optional but recommended |

```bash
cp deploy/env.example .env
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

Full guide (tags, `BASE_PATH`, reverse proxy, API-only, upgrades): **[docs/deployment.md](docs/deployment.md)**.

## Run locally (from source)

Images build from the **repo root** so Docker can copy [`plugins/`](plugins/). The paths below start **API + web** unless noted.

### API only (headless)

Minimum deployment: the `api` image alone. Checks run on schedule, results are stored, and notifiers fire — no dashboard required.

```bash
mkdir -p data
docker run -d \
  --name umpire-api \
  -p 3000:3000 \
  -v "$(pwd)/data:/data" \
  -e DATABASE_PATH=/data/monitor.sqlite \
  umpire-api:latest
```

Use your registry tag if you pulled a published image (e.g. `nitroxstudios/umpire-api:latest`). To build locally first: `docker compose build api`, then tag the resulting image or run `docker compose up api -d` and publish port `3000` on the `api` service (Compose does not expose it by default).

- Health: `http://localhost:3000/api/health`
- Swagger: `http://localhost:3000/documentation` — full interactive API reference
- Operator guide with curl examples: [docs/api.md](docs/api.md)
- Add a target: `POST /api/targets` with `url` and `interval_seconds`
- Set a webhook URL: `PUT /api/plugins/notify/webhook/config`
- Agents: point [MCP](mcp/README.md) at `http://localhost:3000` (or your public API URL)

### Deploy script (recommended — API + web)

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

The API reads the same `BASE_PATH` at **runtime** (Compose passes it to the `api` service). Swagger UI uses **relative** asset URLs when you open `/documentation/` with a trailing slash, so it works at both `/documentation/` and `/umpire/documentation/`. The API resolves the public prefix per request from `X-Forwarded-Prefix` (set by the web container) with `BASE_PATH` as fallback — this supports **both** reverse-proxy styles:

| Front proxy | Example `proxy_pass` | What the web container receives |
|-------------|----------------------|----------------------------------|
| **Preserve path** | `http://127.0.0.1:8089/umpire/` | `/umpire/documentation/` |
| **Strip path** | `http://127.0.0.1:8089/` | `/documentation/` (header `X-Forwarded-Prefix: /umpire` added automatically) |

If Swagger is a blank page, open **`…/documentation/`** (trailing slash), confirm `.env` has `BASE_PATH=/umpire`, and rebuild **both** images. If your front nginx strips the path, it may also set `X-Forwarded-Prefix` (optional — the web image sets it when `BASE_PATH` is configured).

Your reverse proxy can either forward `/umpire/...` as-is or strip the prefix before proxying; the web container accepts both when built with that `BASE_PATH`. Local health checks stay on the published port without the prefix: `http://127.0.0.1:8089/api/health`.

**WebSockets:** UMPIRE uses three realtime channels — **agent chat** at `/api/agent/ws`, **HTTP bridge** at `/api/ws`, and **dashboard SSE** at `/api/stream`. See [docs/agents.md](docs/agents.md#websockets).

When `BASE_PATH=/umpire`, the web image proxies `/umpire/api/agent/ws` directly. Your front reverse proxy must forward `Upgrade` and `Connection` for WebSocket paths, for example:

```nginx
location /umpire/ {
  proxy_pass http://127.0.0.1:8089;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 1d;
}
```

### Docker Compose (API + web)

Same images and volumes as the deploy script, without the format step or health wait:

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

- `./scripts/deploy.sh` — build and start API + web with Docker Compose, then wait for `/api/health`
- `WEB_PORT=8090 ./scripts/deploy.sh` — deploy and health-check with a custom web port
- `BASE_PATH=/umpire ./scripts/deploy.sh` — bake a subdirectory public path into the web image
- `./scripts/publish-docker.sh` — build and push `umpire-api` / `umpire-web` to Docker Hub (reads `.env.dockerhub`)
- `docker compose -f docker-compose.hub.yml pull` — pull published images (see [docs/deployment.md](docs/deployment.md))

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
cd agent && npm install && npm run build
cd ../api && npm ci && npm run lint && npm run format:check && npm run test:ci && npm run build
cd ../web && npm ci && npm run lint && npm run format:check && npm run build
```

Pushes and pull requests run [GitHub Actions](.github/workflows/ci.yml) (current Node LTS). Optional on-host deploy: Jenkins Pipeline in `Jenkinsfile` — [setup](docs/jenkins.md).

## Alert policies

- **state_change** (default) — notify once when a target goes down, once when it recovers
- **every_fail** — notify on every failed check
- **throttle** — notify on first failure, then at most once per N minutes while still down (and once on recover)

## API

**Authoritative reference:** Swagger UI at [http://localhost:8089/documentation](http://localhost:8089/documentation) (or `:3000/documentation` on the API). OpenAPI JSON: `/documentation/json`.

**Operator guide** (headless curl examples, auth, route map): **[docs/api.md](docs/api.md)**.

Summary of route groups:

- **Core** — `/api/health`, `/api/groups`, `/api/targets`, `/api/settings`, `/api/status`, `/api/incidents`, `/api/schema`, `/api/checks`, `/api/notifiers`, `/api/plugins`, `/api/plugin-manager`
- **Auth & admin** — `/api/auth/*`, `/api/tokens`, `/api/users`, `/api/roles` (when auth is enabled)
- **Per-target** — `/api/targets/:id/results`, `/api/targets/:id/checks/:checkId/config`, `/api/targets/:id/notifiers/:notifierId/check-ids`
- **Plugins** — `/api/plugins/<kind>/<id>/…` (HTTP check, webhook, Slack, FCM, etc. — see `GET /api/plugins`)
- **Agent** — `/api/agent/status`, `/api/agent/settings`, `/api/agent/ws` (WebSocket)
- **Realtime** — `/api/stream` (SSE), `/api/ws` (WebSocket HTTP bridge)

WebSocket and SSE frame protocols: [docs/agents.md](docs/agents.md#websockets). MCP tool surface: [mcp/README.md](mcp/README.md).

## Groups and tags

Groups form one or more trees (`parent = 0` is a root). Default tags:

- Root: `group_{id}` (e.g. `group_1`)
- Child: `group_{rootSeg}_{childSeg}_…` (e.g. child `2` under root `1` → `group_group_1_group_2`)

Targets attach to **child** groups via `group_id` (not roots). Deleting a group deletes its subtree and clears `group_id` on affected targets.

## Data

SQLite file: `./data/monitor.sqlite` (bind-mounted in Compose at `/data/monitor.sqlite`). Plugin sidecars next to the DB: `./data/http-check-defaults.json`, `./data/webhook.json`, `./data/slack.json`, `./data/fcm-tokens.json`, `./data/fcm-service-account.json`, `./data/plugin-manager.json`, and other plugin config files as documented in [docs/plugins.md](docs/plugins.md). Per-target check and notifier overrides are stored in SQLite (`target_check_configs`, `target_notifier_configs`).

## Notes

- Optional auth (off by default): create a user in Settings, then enable authentication. With auth on and anonymous read-only off, the UI shows a login screen. Prefer binding to localhost or a VPN/firewall even with auth enabled.
- Default branch for this repo is `master`
- Local run: [`./scripts/deploy.sh`](scripts/deploy.sh) or `docker compose up --build -d` (repo-root build context). Use host `npm run dev` only when writing plugins or core — [CONTRIBUTING.md](CONTRIBUTING.md)
- CI: GitHub Actions on push/PR ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). Optional CD: Jenkins — [setup](docs/jenkins.md)
- Dependency updates: Dependabot (`.github/dependabot.yml`) for npm, Docker, and GitHub Actions
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Browser extensions (Chrome + Firefox): [extensions/README.md](extensions/README.md)
- HTTP API operator guide: [docs/api.md](docs/api.md)
- **Deployment** (Docker Hub, Compose, reverse proxy): [docs/deployment.md](docs/deployment.md)
- AI agents (MCP, web chat, tokens, WebSockets): [docs/agents.md](docs/agents.md)
- MCP server: [mcp/README.md](mcp/README.md)
- Agent CLI + web chat: [agent/README.md](agent/README.md)
- Plugin authoring (API + UI + dashboard widgets): [docs/plugins.md](docs/plugins.md) — implementations live in [`plugins/`](plugins/)
- Core host (pipeline, schema, plugin host, UI shell): [docs/core.md](docs/core.md)
