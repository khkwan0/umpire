# HTTP API guide

UMPIRE is driven by the **API** process. The web UI is a client of the same routes. For headless deployments, use this guide plus the interactive reference below.

## Interactive reference (Swagger)

When the API is running:

| Resource | URL |
|----------|-----|
| **Swagger UI** | `http://localhost:3000/documentation/` (API-only) or `http://localhost:8089/documentation/` (via web). With `BASE_PATH=/umpire`, use `…/umpire/documentation/` — **trailing slash required**. Works with preserve-path and strip-path reverse proxies (see [README — BASE_PATH](../README.md#public-url-path-base_path)). |
| **OpenAPI JSON** | `/documentation/json` |

Swagger lists every REST route with request/response schemas, including plugin namespaces under `/api/plugins/<kind>/<id>/…`. Discover the full catalog at `GET /api/plugins`.

WebSocket (`/api/ws`, `/api/agent/ws`) and SSE (`/api/stream`) protocols are summarized in Swagger route descriptions; details are in [Agents guide — WebSockets](agents.md#websockets).

## Base URL

| Deployment | Base URL |
|------------|----------|
| API container (port 3000 published) | `http://localhost:3000` |
| Default Compose / deploy script | `http://localhost:8089` (nginx proxies `/api` to the API) |
| Subpath hosting (`BASE_PATH=/umpire`) | `https://example.com/umpire` |

All paths below are relative to the base URL.

## Authentication

Auth is **off by default**. When enabled (`PUT /api/settings` → `auth_enabled: true`), protected routes require either:

- **Session cookie** — `POST /api/auth/login`, then send `umpire_session` on later requests
- **Bearer token** — `POST /api/tokens` (while logged in), then `Authorization: Bearer umpire_…`

Check policy without credentials: `GET /api/auth/policy`. Current principal: `GET /api/auth/me`.

See [Agents guide — API tokens](agents.md#api-tokens) for token creation and MCP usage.

## Quick start (headless)

Minimal flow: add a target, configure webhook delivery, confirm status.

```bash
API=http://localhost:3000

# 1. Health
curl -fsS "$API/api/health"

# 2. Add a target (check every 60s)
curl -fsS -X POST "$API/api/targets" \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","interval_seconds":60,"enabled":true}'

# 3. Set global webhook URL (default notifier)
curl -fsS -X PUT "$API/api/plugins/notify/webhook/config" \
  -H 'content-type: application/json' \
  -d '{"url":"https://hooks.example.com/umpire","method":"POST"}'

# 4. Dashboard summary
curl -fsS "$API/api/status"
```

Optional: enable loaded notifiers in **Settings → Plugin manager** via API:

```bash
curl -fsS -X PUT "$API/api/plugin-manager/notify/slack" \
  -H 'content-type: application/json' \
  -d '{"enabled":true}'
```

## Route map

### Core

| Area | Methods | Path |
|------|---------|------|
| Health | `GET` | `/api/health` |
| Auth | `GET` | `/api/auth/policy`, `/api/auth/me` |
| Auth | `POST` | `/api/auth/login`, `/api/auth/logout` |
| API tokens | `GET`, `POST` | `/api/tokens` |
| API tokens | `DELETE` | `/api/tokens/:id` |
| Users (admin) | `GET`, `POST` | `/api/users` |
| Users (admin) | `GET`, `PUT`, `DELETE` | `/api/users/:id` |
| Roles (admin) | `GET`, `POST` | `/api/roles` |
| Roles (admin) | `GET`, `PUT`, `DELETE` | `/api/roles/:id` |
| Groups | `GET`, `POST` | `/api/groups` (`?tree=1` for nested trees) |
| Groups | `GET`, `PATCH`, `DELETE` | `/api/groups/:id` |
| Targets | `GET`, `POST` | `/api/targets` |
| Targets | `POST` | `/api/targets/evaluate-checks` |
| Targets | `PATCH`, `DELETE` | `/api/targets/:id` |
| Targets | `GET` | `/api/targets/:id/results` |
| Target check config | `GET`, `PUT`, `DELETE` | `/api/targets/:id/checks/:checkId/config` |
| Notifier check allowlist | `GET` | `/api/notifiers/check-ids` |
| Notifier check allowlist | `GET`, `PUT` | `/api/targets/:id/notifiers/:notifierId/check-ids` |
| Settings | `GET`, `PUT` | `/api/settings` |
| Status | `GET` | `/api/status` |
| Incidents | `GET` | `/api/incidents` (`?limit=`) |
| Schema | `GET` | `/api/schema` (`?data=1` dumps rows) |
| Checks inventory | `GET` | `/api/checks` |
| Notifiers inventory | `GET` | `/api/notifiers` |
| Plugin catalog | `GET` | `/api/plugins` |
| Plugin manager | `GET` | `/api/plugin-manager` |
| Plugin manager | `PUT` | `/api/plugin-manager/:kind/:id` (`kind` = `check` \| `notify` \| `scheduler`) |
| Agent | `GET` | `/api/agent/status` |
| Agent (admin) | `GET`, `PUT` | `/api/agent/settings` |

### Plugin namespaces

Each loaded plugin mounts under `/api/plugins/<kind>/<id>/…`. Common patterns:

| Plugin | Global config | Per-target override |
|--------|---------------|---------------------|
| HTTP check | `GET/PUT …/check/http/config` | `GET/PUT/DELETE …/check/http/targets/:targetId/config`, `POST …/test` |
| Keyword-body check | — | `GET/PUT …/check/keyword-body/targets/:targetId/config` |
| Webhook | `GET/PUT …/notify/webhook/config`, `POST …/test` | `GET …/overrides`, `GET/PUT/DELETE …/targets/:targetId/config`, `POST …/test` |
| Slack, Discord, Telegram, Email | Same as webhook | Same as webhook |
| FCM | `GET/POST/PATCH/DELETE …/notify/fcm/tokens`, import/test routes | `GET/PUT/DELETE …/targets/:targetId/config` |

Use `GET /api/plugins` for the exact method/path list on your deployment (depends on `api/plugins.json` and plugin-manager flags).

### Realtime (not REST)

| Mechanism | Path | Docs |
|-----------|------|------|
| Dashboard SSE | `GET /api/stream` | [WebSockets — SSE](agents.md#dashboard-sse-apistream) |
| HTTP bridge WebSocket | `GET /api/ws` | [HTTP bridge](agents.md#http-bridge-websocket-apiws) |
| Agent chat WebSocket | `GET /api/agent/ws` | [Agent chat](agents.md#agent-chat-websocket-apiagentws) |

## Target and allowlist fields

`POST /api/targets` and `PATCH /api/targets/:id` accept:

- `url` — `http(s)://…` or bare hostname/IP (optional `:port`)
- `interval_seconds` — check interval; `0` or `enabled: false` pauses
- `group_id` — optional child group
- `check_ids` — optional allowlist of check plugin ids; `[]` = all **enabled** checks
- `notifier_ids` — optional allowlist of notifier ids; `[]` = all **enabled** notifiers

## Alert policy

`GET/PUT /api/settings` — `alert_policy`:

- `state_change` (default) — notify on down and on recovery
- `every_fail` — notify on every failed check
- `throttle` — first failure, then at most once per N minutes while down, plus recovery

## Automation alternatives

| Tool | When to use |
|------|-------------|
| **curl / scripts** | One-off ops, CI, headless bootstrap |
| **[MCP server](../mcp/README.md)** | AI agents in Cursor, Claude Desktop, etc. (`umpire_request`, generated tools per route) |
| **`/api/ws` bridge** | Long-lived token-authenticated clients that prefer WebSocket RPC |

## See also

- [README — API only deployment](../README.md#api-only-headless)
- [Agents guide](agents.md) — tokens, WebSockets, built-in web agent
- [Core guide — HTTP API](core.md#http-api-and-ui-shell)
