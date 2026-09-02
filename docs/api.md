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

Authentication is provided by the **`rbac` auth plugin** (`"auth": "rbac"` in `api/plugins.json`, enabled by default). When the auth plugin is **disabled** or absent, the API runs in open mode: every request gets anonymous admin access and no login is required.

### Bootstrap (fresh install with rbac enabled)

On first start with an empty database and rbac enabled, the API creates the initial admin from environment variables and refuses to start without them:

| Variable | Required | Purpose |
|----------|----------|---------|
| `UMPIRE_ADMIN_USERNAME` | Fresh install + rbac enabled | Bootstrap admin username (min 2 chars) |
| `UMPIRE_ADMIN_PASSWORD` | Fresh install + rbac enabled | Bootstrap admin password (min 8 chars) |

Existing databases with users ignore these variables. When rbac is disabled, bootstrap env vars are not needed.

### Auth modes

| Mode | How | Login |
|------|-----|-------|
| **Secured (default)** | `"auth": "rbac"` in `plugins.json`, enabled in plugin manager | Required (unless read-only-without-auth is on) |
| **Open** | Remove `"auth"` from `plugins.json`, or disable auth in plugin manager and restart | Not required — all requests run as anonymous admin |

### Read-only without login (rbac only)

Admins can allow unauthenticated read access while keeping writes protected:

- **UI:** Settings → Authentication → *Allow read-only access without signing in*
- **API:** `PUT /api/plugins/auth/rbac/config` with `{ "allow_readonly_without_auth": true }`

When enabled, `GET /api/auth/policy` returns `login_required: false` and anonymous clients receive read-only principals on `GET`/`HEAD`/`OPTIONS`.

Disabling or enabling the auth plugin itself requires an **API restart** (Settings → Plugin manager → Auth).

**API-only Docker example:**

```bash
mkdir -p data
docker run -d \
  --name umpire-api \
  -p 3000:3000 \
  -v "$(pwd)/data:/data" \
  -e DATABASE_PATH=/data/monitor.sqlite \
  -e UMPIRE_ADMIN_USERNAME=admin \
  -e UMPIRE_ADMIN_PASSWORD=change-me-on-first-login \
  nitroxstudios/umpire-api:latest
```

Change the bootstrap password after first login (see below). Use secrets management in production — do not commit real passwords.

### Credentials

Protected routes accept either:

- **Session cookie** — `POST /api/auth/login`, then send `umpire_session` on later requests (`curl -c` / `-b`)
- **Bearer token** — `POST /api/tokens` (while logged in), then `Authorization: Bearer umpire_…`

Public paths (no credentials): `/api/health`, `/api/auth/policy`, `/api/auth/login`, `/api/auth/logout`.

| Endpoint | Access | Purpose |
|----------|--------|---------|
| `GET /api/auth/policy` | Public | Returns `{ auth_enabled, allow_readonly_without_auth, login_required, user_count }` |
| `GET /api/auth/me` | Authenticated | Current principal |
| `POST /api/auth/login` | Public | Set session cookie |
| `POST /api/auth/logout` | Session | Clear session |
| `POST /api/auth/change-password` | Authenticated | `{ current_password, new_password }` — any signed-in user |

### Roles

Built-in roles (seeded on install):

| Slug | Access |
|------|--------|
| `admin` | Full access — users, roles, settings, plugin manager |
| `read_write` | Mutate targets, checks, notifiers; no admin paths |
| `read_only` | Read-only API access |

Admins create additional users via `POST /api/users` with a `role_id`. Custom roles (plugin allowlists) via `/api/roles`.

See [Agents guide — API tokens](agents.md#api-tokens) for token creation and MCP usage.

## Quick start (headless)

Minimal flow: start API with bootstrap env, log in, add a target, configure webhook delivery, confirm status.

```bash
API=http://localhost:3000
USER=admin
PASS=change-me-on-first-login

# 0. Health (no auth)
curl -fsS "$API/api/health"

# 1. Log in and save session cookie
curl -fsS -c /tmp/umpire.cookies -X POST "$API/api/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}"

# 2. (Recommended) Change bootstrap password
curl -fsS -b /tmp/umpire.cookies -X POST "$API/api/auth/change-password" \
  -H 'content-type: application/json' \
  -d '{"current_password":"'"$PASS"'","new_password":"your-new-password"}'

# 3. (Optional) Create a long-lived API token for scripts/MCP
curl -fsS -b /tmp/umpire.cookies -X POST "$API/api/tokens" \
  -H 'content-type: application/json' \
  -d '{"label":"automation","expires_in_days":365}'
# Copy the umpire_… token from the response (shown once).
# Then use:  -H "Authorization: Bearer umpire_…"

# 4. Add a target (check every 60s)
curl -fsS -b /tmp/umpire.cookies -X POST "$API/api/targets" \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","interval_seconds":60,"enabled":true}'

# 5. Set global webhook URL (default notifier)
curl -fsS -b /tmp/umpire.cookies -X PUT "$API/api/plugins/notify/webhook/config" \
  -H 'content-type: application/json' \
  -d '{"url":"https://hooks.example.com/umpire","method":"POST"}'

# 6. Dashboard summary
curl -fsS -b /tmp/umpire.cookies "$API/api/status"
```

Enable loaded notifiers via API (admin or write access):

```bash
curl -fsS -b /tmp/umpire.cookies -X PUT "$API/api/plugin-manager/notify/slack" \
  -H 'content-type: application/json' \
  -d '{"enabled":true}'
```

Create additional users (admin only):

```bash
# List roles to get role_id for admin, read_write, or read_only
curl -fsS -b /tmp/umpire.cookies "$API/api/roles"

curl -fsS -b /tmp/umpire.cookies -X POST "$API/api/users" \
  -H 'content-type: application/json' \
  -d '{"username":"ops","password":"password-here","role_id":2}'
```

## Route map

### Core

| Area | Methods | Path |
|------|---------|------|
| Health | `GET` | `/api/health` |
| Auth | `GET` | `/api/auth/policy`, `/api/auth/me` |
| Auth | `POST` | `/api/auth/login`, `/api/auth/logout`, `/api/auth/change-password` |
| Auth (rbac config, admin) | `PUT` | `/api/plugins/auth/rbac/config` |
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
| Plugin manager | `PUT` | `/api/plugin-manager/:kind/:id` (`kind` = `auth` \| `check` \| `notify` \| `scheduler`; auth toggle requires API restart) |
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
| FCM | `GET/PUT/DELETE …/notify/fcm/credentials`, `GET/POST/PATCH/DELETE …/notify/fcm/tokens`, import/test/register routes | `GET/PUT/DELETE …/targets/:targetId/config` |

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
