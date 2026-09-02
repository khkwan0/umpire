# Plugin developer guide

Cookbook for writing UMPIRE **check**, **scheduler**, **notifier**, and **auth** plugins — including optional HTTP APIs and React UI. Written so a developer can add a working plugin without reverse-engineering the repo.

Operator setup (run the app, shipped plugins, core HTTP API) lives in [`README.md`](../../README.md). Changing the host (pipeline, schema, plugin loader, UI shell): **[Core developer guide](../core.md)**.

## Chapters

| # | Chapter | What you'll learn |
|---|---------|-------------------|
| 1 | [Framework overview](01-framework.md) | Core vs plugins, pipeline, lifecycle, file layout |
| 2 | [Contracts reference](02-contracts.md) | Hard vs soft contracts, TypeScript interfaces, enforcement |
| 3 | [Check plugins](03-check-plugins.md) | Probes, `evaluateTarget`, hello world → HTTP/keyword examples |
| 4 | [Notifier plugins](04-notifier-plugins.md) | Delivery, readiness, hello world → webhook/FCM patterns |
| 5 | [Scheduler plugins](05-scheduler-plugins.md) | When to replace `interval`, hello world → production scheduler |
| 6 | [HTTP routes & UI](06-routes-and-ui.md) | `registerRoutes`, React pages, dashboard widgets |
| 7 | [Registration & testing](07-registration-and-testing.md) | `plugins.json`, plugin manager, verify checklist, tests |
| 8 | [Auth plugins](08-auth-plugins.md) | **One plugin only** — custom login flow, `AuthPlugin` contract, rbac reference |

## Quick start

| You want to… | Kind | Minimum hook |
|--------------|------|--------------|
| Probe a URL (HTTP, TLS, DNS, keyword, …) | `check` | `check(ctx)` |
| Decide *when* targets run (rarely: keep `interval`) | `scheduler` | `start` / `stop` / `reschedule` |
| Deliver an alert (FCM, webhook, email, …) | `notify` | `isReady` + `notify(ctx)` |
| Login and access control (**one plugin only**) | `auth` | `bootstrap` + `resolvePrincipal` + `evaluateAccess` + `registerRoutes` |

**Id rule (must all match):** folder name, `plugins.json` entry, `plugin.id`, and UI `id`.

See **[First plugin: from files to running](#first-plugin-from-files-to-running)** below for the full “I wrote the code, now what?” path.

TypeScript contracts: [`api/src/plugins/types.ts`](../../api/src/plugins/types.ts). UI contracts: [`web/src/plugin-ui.ts`](../../web/src/plugin-ui.ts) (`PluginUiModule`, `AuthPluginUiModule`).

## First plugin: from files to running

You wrote `plugins/<kind>/<id>/index.ts`. Here is everything that happens **after** that.

### 1. Register the plugin (required)

Edit [`api/plugins.json`](../../api/plugins.json) and add your id:

```json
{
  "checks": ["http", "my-check"],
  "scheduler": "interval",
  "notifiers": ["webhook", "my-notify"]
}
```

If you added npm dependencies: `cd api && npm install <pkg>`.

Nothing runs until the id is in this file **and** the API process restarts (or reloads — see below).

### 2. Start the app (pick one path)

**Plugin development — use this.** Faster iteration; API reloads on save.

```bash
# Terminal 1 — API (loads plugins/ on startup; tsx watch reloads when you edit)
cd api && npm install && \
  DATABASE_PATH=../data/monitor.sqlite \
  npm run dev

# Terminal 2 — UI (only if you added ui/index.tsx, or you want the dashboard)
cd web && npm install && npm run dev
```

Open [http://localhost:8089](http://localhost:8089). Vite proxies `/api` to the API on port 3000.

**Do not** run `npm run dev` and `docker compose` at the same time — both bind host port **8089**.

**Packaged / production-like stack — Docker.** Use when you are not actively editing code, or to test the built images.

```bash
cp .env.example .env   # first time only
docker compose up -d --build
# or: ./scripts/deploy.sh
```

Docker copies `plugins/` into the images at **build** time. After changing plugin code or UI you must rebuild:

```bash
docker compose up -d --build
```

Rebuild **both** `api` and `web` if you changed `ui/index.tsx` (Vite globs plugin UI at build time).

| What you changed | `npm run dev` | Docker |
|------------------|---------------|--------|
| `index.ts` / routes / config | Save file — API restarts automatically | `docker compose up -d --build` |
| `ui/index.tsx` | Save — refresh browser (Vite HMR) | Rebuild web image |
| `plugins.json` only | Restart API (`tsx watch` may not reload manifest) | Rebuild + restart containers |

### 3. Enable in plugin manager (notifiers especially)

**Load** (`plugins.json`) ≠ **enabled** (`data/plugin-manager.json`).

| Kind | Default after first load |
|------|--------------------------|
| Check | **Enabled** — runs without extra steps |
| Notifier | **Disabled** (except `webhook`) — turn on in **Settings → Plugin manager** |
| Scheduler | **Enabled** — only one id in `plugins.json` |
| Auth | **Enabled** — only one id in `plugins.json`; disable in plugin manager for open mode (immediate) |

Or via API: `PUT /api/plugin-manager/notify/my-notify` with body `{ "enabled": true }`.

### 4. Confirm it loaded

Check API stdout for lines like `[plugins] check=…` / `notifier=… ready=…`.

Quick checks:

```bash
curl -s http://localhost:3000/api/plugins | jq '.[] | select(.id=="my-check")'
curl -s http://localhost:3000/api/plugin-manager
```

In the UI: **Settings → Plugin manager** should list your plugin.

### 5. Exercise it

| Kind | How to see it work |
|------|-------------------|
| **Check** | Add a target (URL + interval). Leave checks unchecked (= all enabled) or tick yours. Wait for the scheduler tick or shorten `interval_seconds`. |
| **Notifier** | Configure it (sidecar/UI if needed), enable in plugin manager, attach to a target, trigger an alert (`every_fail` policy is easiest while testing). |
| **Scheduler** | Replaces `interval` process-wide — only for advanced use; confirm targets still run on your schedule. |

Full verify checklist: [Chapter 7 — Registration & testing](07-registration-and-testing.md#verify-checklist).

### What you do *not* need

- A separate “plugin start” command — core loads plugins during API startup (`initPlugins()`).
- Editing `data/plugin-manager.json` by hand — the UI/API is enough (file is written for you).
- Docker for day-to-day plugin authoring — `npm run dev` is the intended path ([CONTRIBUTING.md](../../CONTRIBUTING.md)).

## Shipped references

Each shipped plugin has usage + developer notes in [`plugins/<kind>/<id>/README.md`](../../plugins/README.md).

| Plugin | Why read it |
|--------|-------------|
| [`ping`](../../plugins/check/ping/index.ts) | Minimal check — single file, no routes |
| [`http`](../../plugins/check/http/README.md) | Full configurable check with sidecar + per-target overrides |
| [`keyword-body`](../../plugins/check/keyword-body/README.md) | Per-target config in SQLite only |
| [`interval`](../../plugins/scheduler/interval/README.md) | Production scheduler with differential `reschedule` |
| [`webhook`](../../plugins/notify/webhook/README.md) | Sidecar notifier with config routes + UI |
| [`fcm`](../../plugins/notify/fcm/README.md) | Complex notifier: credentials, destination CRUD, Firebase SDK |
