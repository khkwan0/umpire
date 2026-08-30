# Plugin developer guide

Cookbook for writing UMPIRE **check**, **scheduler**, and **notifier** plugins — including optional HTTP APIs and React UI. Written so a developer can add a working plugin without reverse-engineering the repo.

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

## Quick start

| You want to… | Kind | Minimum hook |
|--------------|------|--------------|
| Probe a URL (HTTP, TLS, DNS, keyword, …) | `check` | `check(ctx)` |
| Decide *when* targets run (rarely: keep `interval`) | `scheduler` | `start` / `stop` / `reschedule` |
| Deliver an alert (FCM, webhook, email, …) | `notify` | `isReady` + `notify(ctx)` |

**Id rule (must all match):** folder name, `plugins.json` entry, `plugin.id`, and UI `id`.

1. Create `plugins/<kind>/<id>/index.ts`.
2. Add the id to [`api/plugins.json`](../../api/plugins.json).
3. Restart the API. Rebuild **web** if you added UI.
4. Enable the plugin in **Settings → Plugin manager** (new notifiers default to disabled except `webhook`).

TypeScript contracts: [`api/src/plugins/types.ts`](../../api/src/plugins/types.ts). UI contract: [`web/src/plugin-ui.ts`](../../web/src/plugin-ui.ts).

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
