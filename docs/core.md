# Core developer guide

Cookbook for changing UMPIRE **core** — the host that stores data, runs the pipeline, and enforces plugin contracts. Written so a developer or LLM can change core without reverse-engineering the repo.

Writing a check, scheduler, or notifier: **[Plugin developer guide](plugins.md)**. Operator setup (run the app, shipped plugins, HTTP API list): [`README.md`](../README.md).

## Contents

1. [Core vs plugins](#core-vs-plugins)
2. [Start here](#start-here)
3. [Layout](#layout)
4. [Boot sequence](#boot-sequence)
5. [Authentication and RBAC](#authentication-and-rbac)
6. [Frozen schema](#frozen-schema)
7. [Pipeline](#pipeline)
8. [Alert policy](#alert-policy)
9. [Notifier routing](#notifier-routing)
10. [Plugin host](#plugin-host)
11. [HTTP API and UI shell](#http-api-and-ui-shell)
12. [Realtime](#realtime)
13. [Do / don’t](#do--dont)
14. [Verify](#verify)
15. [Source map](#source-map)

---

## Core vs plugins

Core is the **host**. Plugins are the **workers**.

Core never probes a URL, never decides *when* to probe, and never sends a webhook or push. Plugins never store monitoring history and never decide *whether* an alert should fire.

If the change is “a new way to probe, schedule, or deliver,” it belongs in a plugin. If the change is “how the host stores state, runs a cycle, or exposes the shell,” it belongs in core.

Shared TypeScript contracts live in [`api/src/plugins/types.ts`](../api/src/plugins/types.ts). Core **calls** those hooks. Plugins **must not** import the pipeline or write frozen tables.

---

## Start here

| You want to… | Touch | Do not |
|--------------|-------|--------|
| Add a check / notifier / scheduler | Plugin under `plugins/` | Core routes or SQLite tables |
| Change *whether* alerts fire | [`api/src/alert.ts`](../api/src/alert.ts) | Notifier `notify()` |
| Change *which* notifier gets an alert | [`api/src/core/notifierRouting.ts`](../api/src/core/notifierRouting.ts) | Plugin UI reimplementing `check_ids` |
| Change what a cycle does | [`api/src/pipeline.ts`](../api/src/pipeline.ts) | Check plugins writing `check_results` |
| Add a core HTTP resource | `api/src/routes/` + OpenAPI in that file | Plugin `registerRoutes` on `/api/targets` |
| Add auth / users / roles | [`api/src/auth/`](../api/src/auth/) + routes | A new plugin kind for login |
| Add a core UI page | `web/src/pages/` + [`web/src/App.tsx`](../web/src/App.tsx) | Plugin `ui/` (that is plugin-owned) |
| Persist new monitoring fields | [`api/src/core/schema.ts`](../api/src/core/schema.ts) + [`sqlite.ts`](../api/src/core/sqlite.ts) | Plugin sidecar JSON for core history |
| Enable/disable a loaded plugin | Plugin manager ([`manager.ts`](../api/src/plugins/manager.ts)) | Removing it from the pipeline by hard-coding ids |

**Id rule for plugins** (core must keep enforcing it): folder name, `plugins.json` entry, `plugin.id`, and UI `id` all match.

---

## Layout

```text
plugins/                   # implementations (check / notify / scheduler)
  check/http/
  notify/webhook/
  scheduler/interval/
api/src/
  index.ts                 # boot: initCore → initPlugins → Fastify → scheduler.start()
  pipeline.ts              # runCheck(targetId) — the only check cycle
  alert.ts                 # shouldAlert + title/body + aggregate outcomes
  incidents.ts             # outage windows derived from check_results
  realtime.ts              # in-process pub/sub for SSE
  openapi.ts               # Swagger / OpenAPI registration
  core/
    schema.ts              # frozen table definitions
    sqlite.ts              # CoreStore implementation
    types.ts               # CoreStore interface
    notifierRouting.ts     # per-notifier check_ids filter
    index.ts               # getCore()
  plugins/                 # host only (not implementations)
    types.ts               # plugin contracts
    registry.ts            # load plugins.json and plugins/
    manager.ts             # runtime enable/disable (data/plugin-manager.json)
    routes.ts              # namespace /api/plugins/<kind>/<id>/…
    runtime.ts             # in-memory loaded plugin lists
  routes/                  # core Fastify modules only (includes ws.ts bridge)
web/src/
  App.tsx                  # shell: Dashboard, Groups, Targets, Settings, plugin glob
  pages/                   # core screens
  plugin-ui.ts             # PluginUiModule contract
  realtime.ts              # SSE / polling hook
```

Sidecar JSON next to the SQLite file (`webhook.json`, `plugin-manager.json`, …) is **plugin-owned** (or host flags for the manager). Do not move plugin secrets into core `.env` or frozen tables.

Docker: [`api/Dockerfile`](../api/Dockerfile) and [`web/Dockerfile`](../web/Dockerfile) must be built with **repo-root context** (`docker compose build`, or `docker build -f api/Dockerfile .`) so they can copy `plugins/`. Do not build with `api/` or `web/` as the context. Do not run Compose and host `npm run dev` at the same time — both use host port **8089**.

[`api/tsconfig.json`](../api/tsconfig.json) uses `module: ES2022` so files under `plugins/` emit ESM. `module: NodeNext` would compile those files as CommonJS (no `"type": "module"` outside `api/`) and crash production Node (`exports is not defined`).

---

## Boot sequence

[`api/src/index.ts`](../api/src/index.ts):

1. `initCore(DATABASE_PATH)` — open SQLite, apply frozen schema.
2. `initPlugins()` — read [`api/plugins.json`](../api/plugins.json), load modules, call notifier `init()`, then `initPluginManager()`.
3. `scheduler.init({ getTargets, run })` — `run` **is** `runCheck`. That is the only way a cycle starts.
4. Register auth gate (`onRequest`), core Fastify routes (including auth/users/roles), then `mountAllPluginRoutes`, then `GET /api/plugins` (catalog is filled by the mount).
5. `listen`, then `scheduler.start()`.
6. On `SIGTERM` / `SIGINT`: `scheduler.stop()`, `closeCore()`.

`PLUGINS_CONFIG` overrides the `plugins.json` path. `PLUGINS_ROOT` overrides the implementations directory (default: repo `plugins/`). `DATABASE_PATH` defaults to `./data/monitor.sqlite`.

---

## Authentication and RBAC

Auth is **host-owned** (not a plugin kind). Default: disabled — every HTTP API is open.

| Setting | Meaning |
|---------|---------|
| `auth_enabled` | When true, mutating methods need a session with `can_write`; admin-only paths need `is_admin` |
| `allow_readonly_without_auth` | When auth is on, allow unauthenticated `GET`/`HEAD` as read-only |

Rules:

- Cannot set `auth_enabled` until at least one user exists.
- With exactly one user, that user is always effective **admin** (full access), regardless of assigned role.
- Built-in roles `admin` and `read_only` are seeded and immutable. Custom roles have `can_write` plus a plugin allowlist (`role_plugins`). Empty allowlist = no plugin HTTP/UI access.
- Admin-only: `/api/users`, `/api/roles`, `PUT /api/settings`, plugin-manager mutations.
- Plugin namespaces `/api/plugins/<kind>/<id>/…` are gated by the allowlist for non-admin roles.
- Pipeline / in-process `runCheck` writes are **not** gated by HTTP auth.

### API tokens (agents & automation)

Bearer tokens complement browser cookie sessions for MCP servers, scripts, and other non-browser clients.

| Endpoint | Access |
|----------|--------|
| `GET /api/tokens` | List own tokens; admin sees all |
| `POST /api/tokens` | Create a token for the current user (`{ label?, expires_in_days? }`) — response includes `token` **once** |
| `DELETE /api/tokens/:id` | Revoke own token; admin may revoke any |

Send `Authorization: Bearer umpire_…` on HTTP and WebSocket-bridge requests. Tokens inherit the creating user's role and plugin allowlist. Store only a SHA-256 hash server-side (`api_tokens` table).

When `auth_enabled` is false, tokens are optional (anonymous admin applies).

### MCP agents

The [`mcp/`](../mcp/) package is an MCP server (stdio) that exposes UMPIRE HTTP routes as tools for LLM hosts (Claude Desktop, Cursor, etc.). It does **not** embed an LLM — configure your model in the host.

- `UMPIRE_BASE_URL` — same origin as the web UI
- `UMPIRE_API_TOKEN` — Bearer token when auth is on
- Tools: `umpire_request`, `umpire_list_routes`, plus one tool per core/plugin route

See [`mcp/README.md`](../mcp/README.md).

Source: [`api/src/auth/`](../api/src/auth/), routes in `api/src/routes/auth.ts`, `tokens.ts`, `users.ts`, `roles.ts`. UI: Settings + `/login`.

---

## Frozen schema

Source of truth: [`api/src/core/schema.ts`](../api/src/core/schema.ts). Published at `GET /api/schema` (`?data=1` dumps rows).

| Table | Role |
|-------|------|
| `groups` | Tree (`parent = 0` is a root). Targets attach to **child** groups only. |
| `targets` | What to watch: `url`, `interval_seconds`, `enabled`, `group_id`, `check_ids`, `notifier_ids` |
| `settings` | Alert policy, throttle, and auth toggles (`key` / `value`) |
| `check_results` | History of aggregated runs |
| `target_state` | Latest health, last check, last alert time |
| `target_check_configs` | Per-target check plugin JSON overrides |
| `target_notifier_configs` | Per-target notifier JSON + core `check_ids` allowlist |
| `roles` | Built-in `admin` / `read_only` plus custom roles (`can_write`) |
| `role_plugins` | Custom role plugin allowlists (`kind` + `plugin_id`) |
| `users` | Local accounts (`username`, `password_hash`, `role_id`) |
| `sessions` | HttpOnly cookie sessions (`token_hash`, `expires_at`) |
| `api_tokens` | Bearer tokens for agents (`token_hash`, `token_prefix`, optional `expires_at`) |

Plugins **must not** `ALTER` these tables. Adding a column is a core migration in `schema.ts` **and** `sqlite.ts` (including any `ensureColumn` path). Prefer JSON override blobs over new columns when the data is plugin-specific.

Health encoding in SQLite: `1` = up, `0` = down, `2` = partial (`healthToDb` / `healthFromDb` in `types.ts`).

Empty `check_ids` / `notifier_ids` on a target means **all enabled** plugins of that kind, not “none.”

---

## Pipeline

[`runCheck(targetId)`](../api/src/pipeline.ts) is the whole cycle:

```text
target missing or paused? → return
resolve checks (allowlist ∩ plugin manager ∩ evaluateTarget)
run remaining checks
aggregate → up / down / partial
recordCheckResult + target_state
publish status.updated + incidents.updated
shouldAlert? → else return
build AlertEvent (title/body from alertCopy)
pick enabled notifiers (allowlist ∩ plugin manager)
for each notifier:
  load target_notifier_configs row
  skip if check_ids filter fails
  notify({ event, config })
if any notify succeeded → markAlertSent
```

Rules core must keep:

- Checks return `{ ok, statusCode, error, latencyMs }`. They do not write SQLite.
- Optional `evaluateTarget` on a check plugin decides whether that check may run for the target’s `url` / interval / group. Core aggregates via [`checkCompatibility.ts`](../api/src/checkCompatibility.ts), exposes `POST /api/targets/evaluate-checks` for the UI, rejects incompatible ids in create/update allowlists, and **skips** incompatible checks in the pipeline (they are not failures). Plugin-authored rules: [Target parameter validation](plugins.md#target-parameter-validation).
- All ok → `up`; all fail → `down`; mix → `partial`. `latency_ms` is the max. Failures are prefixed `[pluginId]` and joined with `; `.
- Pause (`enabled = 0`) skips the cycle. An in-flight `run` is **not** cancelled.
- `markAlertSent` only if at least one notifier actually ran `notify()` successfully. A check-allowlist skip does not count.
- Core still calls `notify` when `isReady()` is false; the plugin no-ops. Soft skip = return; throw only on hard failure.

Tests: [`api/src/pipeline.test.ts`](../api/src/pipeline.test.ts), [`api/src/alert.test.ts`](../api/src/alert.test.ts), [`api/src/checkCompatibility.test.ts`](../api/src/checkCompatibility.test.ts).

---

## Alert policy

[`api/src/alert.ts`](../api/src/alert.ts) decides *whether* to notify. Notifiers only deliver.

| Policy | When `notify` runs |
|--------|-------------------|
| `state_change` | Health changed (including first non-up). Recovery included. |
| `every_fail` | Every non-up result. No recovery. |
| `throttle` | First non-up, then at most once per `throttle_minutes` while still unhealthy; also on down↔partial and on recovery. |

Title/body are built here (`Site down` / `Site partial` / `Site recovered`). Do not move copy into notifier plugins.

---

## Notifier routing

Two different allowlists:

| Field | Where | Meaning |
|-------|--------|---------|
| `targets.notifier_ids` | Target row | Which **notifier plugins** may be called (`[]` = all enabled) |
| `target_notifier_configs.check_ids` | Per target + notifier JSON | Which **failed checks** must be present before that notifier is called (`[]` = any alert, including recovery) |

[`eventMatchesNotifierCheckFilter`](../api/src/core/notifierRouting.ts): non-empty `check_ids` skips recoveries (`status === 'up'`) and skips unless at least one listed check failed this run.

Core HTTP for the check allowlist: `GET/PUT /api/targets/:id/notifiers/:notifierId/check-ids`. Plugins must not reimplement this in `notify()` or plugin UI.

`useCustom` on the same JSON blob is **plugin** delivery settings (URL, token list, …). Core preserves `check_ids` when plugins save overrides (`preserveNotifierCheckIds`).

Tests: [`api/src/core/notifierRouting.test.ts`](../api/src/core/notifierRouting.test.ts).

---

## Plugin host

Two layers (do not collapse them):

1. **Load list** — [`api/plugins.json`](../api/plugins.json) (`PLUGINS_CONFIG` override). If an id is not listed, it does not exist at runtime.
2. **Enabled flag** — [`data/plugin-manager.json`](../data/plugin-manager.json), toggled at `PUT /api/plugin-manager/:kind/:id` without restart.

Default **enabled** notifier is `webhook`. Other loaded notifiers stay off until Settings → Plugin manager. New notifier ids with no flag default to disabled except `webhook` ([`ensureDefaults`](../api/src/plugins/manager.ts)).

Loading: [`registry.ts`](../api/src/plugins/registry.ts) resolves `plugins/<kind>/<id>/index.ts`. Failed notifier `init()` is logged; other notifiers still load.

HTTP: [`plugins/routes.ts`](../api/src/plugins/routes.ts) mounts each plugin under `/api/plugins/<kind>/<id>/`. Plugins register **relative** paths (`/config`, not `/api/targets`). Core owns the URL map. `GET /api/plugins` lists the catalog.

Pipeline and UI both honor `isPluginEnabled`. Disabled check/notifier plugins stay loaded but are skipped in `runCheck` and hidden from nav/widgets.

---

## HTTP API and UI shell

Core Fastify modules live in [`api/src/routes/`](../api/src/routes/). Add `schema` on new routes so Swagger lists them. Do not let plugins register core paths. Auth gate: [`api/src/auth/`](../api/src/auth/).

Core UI pages (always present): Dashboard, Groups, Targets, Settings, Login (when auth requires it), plus host screens for HTTP check overrides and notifier target overrides. Plugin pages are globbed at build time from `plugins/*/*/ui/index.tsx` ([`web/src/App.tsx`](../web/src/App.tsx)). Rebuild **web** after adding a plugin UI.

[`PluginUiModule`](../web/src/plugin-ui.ts): `check` → Checks dropdown, `notify` → Notifiers dropdown, `scheduler` → top-level link. Optional `Dashboard` is a panel on the core home page, not a replacement for it.

The UI has **no auth**. Bind to localhost or put it behind a VPN.

Typed client: [`web/src/api.ts`](../web/src/api.ts). Keep it in sync when you add core routes the shell uses.

---

## Realtime

[`api/src/realtime.ts`](../api/src/realtime.ts) is in-process pub/sub. [`routes/stream.ts`](../api/src/routes/stream.ts) exposes SSE at `/api/stream`. The web client ([`web/src/realtime.ts`](../web/src/realtime.ts)) falls back to polling if SSE dies.

Known events: `plugin-manager.updated`, `targets.updated`, `status.updated`, `incidents.updated`. Publish after core mutations that the dashboard must see. Do not invent a second `/api/status` loop in plugin UI — use the dashboard `status` prop / existing refresh.

### WebSocket HTTP bridge

[`routes/ws.ts`](../api/src/routes/ws.ts) exposes standard WebSockets at `GET /api/ws` (via `@fastify/websocket`, not socket.io). Clients send JSON frames that map onto the same Fastify routes as HTTP — including `/api/plugins/<kind>/<id>/…` — through `app.inject()`, so the auth gate and plugin mounts stay single-source.

**Client → server**

```json
{
  "id": "req-1",
  "method": "GET",
  "path": "/api/targets",
  "query": { "limit": 10 },
  "headers": { "content-type": "application/json" },
  "body": null
}
```

**Server → client (RPC reply)**

```json
{ "id": "req-1", "status": 200, "headers": { "content-type": "application/json" }, "body": [] }
```

On connect the server also sends `{ "type": "connected", "auth": { … } }`. Upgrade and each injected call use the session cookie (`umpire_session`); `Set-Cookie` from login/logout updates a per-connection cookie jar. `/api/ws` and `/api/stream` cannot be called via the bridge. nginx and the Vite `/api` proxy must forward `Upgrade` / `Connection` (see `web/nginx.conf`, `web/vite.config.ts`).

---

## Do / don’t

| Do | Don’t |
|----|--------|
| Keep frozen tables in `schema.ts` + `sqlite.ts` together | Let a plugin `ALTER` core tables |
| Filter on plugin manager in the pipeline | Hard-code plugin ids in `runCheck` |
| Apply `check_ids` in `notifierRouting.ts` | Duplicate check allowlists in notifiers |
| Namespace plugin HTTP | Accept `registerRoutes` on `/api/targets` |
| Use correct HTTP verbs on plugin routes (auth gate) | Hide mutations behind `GET` |
| Put plugin secrets in sidecar files | Put FCM/webhook secrets in core `.env` |
| Add Jest coverage next to the module you change | Skip `pipeline.test.ts` / `sqlite.test.ts` for behavior changes |
| Update this guide + [`plugins.md`](plugins.md) when contracts move | Grow core to “just this one probe” |

---

## Verify

After a core change, from repo root (same as CI):

```bash
cd api && npm ci && npm run lint && npm run format:check && npm run test:ci && npm run build
cd ../web && npm ci && npm run lint && npm run format:check && npm run build
```

Minimum checks for the area you touched:

1. Pipeline / policy / check compatibility: `npx jest src/pipeline.test.ts src/alert.test.ts src/checkCompatibility.test.ts` (from `api/`)
2. Schema / store: `npx jest src/core/sqlite.test.ts`
3. Auth / RBAC: `npx jest src/auth/`
4. Notifier `check_ids`: `npx jest src/core/notifierRouting.test.ts`
5. `GET /api/schema` still lists only frozen tables
6. Web: Dashboard, Targets, Settings still load; plugin glob still picks up shipped UIs; Targets grays out incompatible checks for bare hosts vs URLs
7. One full check cycle: paused target skipped; enabled target writes `check_results` + `target_state`
8. Docker (if you touch images): build from repo root so `api/Dockerfile` / `web/Dockerfile` copy `plugins/`

---

## Source map

| Piece | Path |
|-------|------|
| Boot | [`api/src/index.ts`](../api/src/index.ts) |
| Auth gate / sessions / API tokens | [`api/src/auth/`](../api/src/auth/) |
| MCP server (agents) | [`mcp/`](../mcp/) |
| Pipeline | [`api/src/pipeline.ts`](../api/src/pipeline.ts) |
| Check ↔ target compatibility | [`api/src/checkCompatibility.ts`](../api/src/checkCompatibility.ts) |
| Target address parse | [`api/src/targetAddress.ts`](../api/src/targetAddress.ts) |
| Alert policy | [`api/src/alert.ts`](../api/src/alert.ts) |
| Incidents | [`api/src/incidents.ts`](../api/src/incidents.ts) |
| Schema | [`api/src/core/schema.ts`](../api/src/core/schema.ts) |
| Store | [`api/src/core/sqlite.ts`](../api/src/core/sqlite.ts) |
| Notifier `check_ids` | [`api/src/core/notifierRouting.ts`](../api/src/core/notifierRouting.ts) |
| Plugin load | [`api/src/plugins/registry.ts`](../api/src/plugins/registry.ts) |
| Plugin enable | [`api/src/plugins/manager.ts`](../api/src/plugins/manager.ts) |
| Plugin HTTP namespace | [`api/src/plugins/routes.ts`](../api/src/plugins/routes.ts) |
| Contracts | [`api/src/plugins/types.ts`](../api/src/plugins/types.ts) |
| Realtime pub/sub | [`api/src/realtime.ts`](../api/src/realtime.ts) |
| WebSocket HTTP bridge | [`api/src/routes/ws.ts`](../api/src/routes/ws.ts) |
| Implementations | [`plugins/`](../plugins/) |
| API image | [`api/Dockerfile`](../api/Dockerfile) (context = repo root) |
| Web image | [`web/Dockerfile`](../web/Dockerfile) (context = repo root) |
| UI shell | [`web/src/App.tsx`](../web/src/App.tsx) |
| Plugin UI contract | [`web/src/plugin-ui.ts`](../web/src/plugin-ui.ts) |
