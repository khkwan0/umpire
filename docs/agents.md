# AI agents and automation

UMPIRE supports two complementary ways to use LLMs with your monitoring data:

| Approach | Who runs the LLM | Best for |
|----------|------------------|----------|
| **[MCP server](../mcp/README.md)** | Your IDE or desktop host (Cursor, Claude Desktop, …) | Day-to-day ops in tools you already use; full route catalog as MCP tools |
| **[Built-in web agent](../agent/README.md)** | UMPIRE API server | In-browser chat at **Agent** (`/agent`); no separate MCP host needed |

Both paths call the same UMPIRE HTTP API and respect auth/RBAC. Neither replaces the other — pick MCP when you want Cursor’s model and workflow; pick the web agent when you want a self-contained chat inside UMPIRE.

---

## Quick start

### 1. Enable auth (recommended for production)

Create a user under **Settings → Users**, then turn on **Require login**. See [Authentication](core.md#authentication-and-rbac) in the core guide.

### 2. Create an API token

**Settings → API tokens** (or `POST /api/tokens` while logged in):

```bash
curl -s -c /tmp/umpire.cookies -X POST http://localhost:8089/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"your-password"}'

curl -s -b /tmp/umpire.cookies -X POST http://localhost:8089/api/tokens \
  -H 'content-type: application/json' \
  -d '{"label":"cursor-mcp","expires_in_days":90}'
```

Copy the `token` field (`umpire_…`) — it is shown **once**. Use a dedicated user/role with the minimum permissions your agent needs.

When `auth_enabled` is false, tokens are optional (anonymous admin applies).

### 3a. Wire MCP (Cursor / Claude Desktop)

```bash
cd mcp && npm install && npm run build
```

Set in `.env` (or MCP host config):

```bash
UMPIRE_BASE_URL=http://localhost:8089   # must match browser origin; include BASE_PATH if used
UMPIRE_API_TOKEN=umpire_…
```

See [MCP server](../mcp/README.md) for Claude Desktop and Cursor examples.

### 3b. Enable the built-in web agent

1. **Settings → AI Agent** — turn on **Enable agent**, choose provider (OpenAI, Anthropic, Ollama, vLLM), model, optional base URL and API key, max tool rounds.
2. Open **Agent** in the top nav (`/agent`).
3. Log in (session cookie) — the chat WebSocket uses your browser session, not the MCP Bearer token.

Saved settings live in the database (`settings` table). Environment variables on the API server are a fallback when nothing is saved (`config_source: environment`). See [Configuration sources](#configuration-sources).

---

## API tokens

Bearer tokens complement browser cookies for MCP, scripts, and the WebSocket HTTP bridge.

| Endpoint | Access |
|----------|--------|
| `GET /api/tokens` | List own tokens; admin sees all |
| `POST /api/tokens` | Create `{ label?, expires_in_days? }` → returns `token` **once** |
| `DELETE /api/tokens/:id` | Revoke own token; admin may revoke any |

Send `Authorization: Bearer umpire_…` on HTTP and on `/api/ws` bridge requests. Tokens inherit the creating user's role and plugin allowlist. Only a SHA-256 hash is stored server-side.

**UI:** **Settings → API tokens** — create, list, and revoke tokens without curl.

---

## MCP server

Package: [`mcp/`](../mcp/). Transport: **stdio** ([Model Context Protocol](https://modelcontextprotocol.io/)).

The MCP server does **not** embed an LLM. Configure your model and API keys in the host (Cursor, Claude Desktop, etc.).

### Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `UMPIRE_BASE_URL` | No | Web/API origin (default `http://localhost:8089`). If you deploy at `https://example.com/umpire`, use that full prefix. |
| `UMPIRE_API_TOKEN` | When auth on | Bearer from **Settings → API tokens** or `POST /api/tokens` |

### Tools

| Tool | Purpose |
|------|---------|
| `umpire_request` | Generic proxy to any `/api/…` route (core + plugins) |
| `umpire_list_routes` | Discover routes and dedicated tool names |
| `get_status`, `get_targets`, … | One generated tool per core and plugin route (from `GET /api/plugins` at startup) |

Auth and RBAC match HTTP: the token’s user role and plugin allowlist apply to every tool call.

Details: [mcp/README.md](../mcp/README.md).

---

## Built-in web agent

Package: [`agent/`](../agent/). Embedded in the API as `umpire-agent`.

### Settings UI

**Settings → AI Agent** (admin):

| Field | Description |
|-------|-------------|
| Enable agent | Master switch; when off, `/agent` shows a disabled state |
| Provider | `openai`, `anthropic`, `ollama`, `vllm` |
| Model | Provider-specific model id |
| Base URL | Optional; for OpenAI-compatible proxies, Ollama, vLLM |
| API key | Stored server-side; UI shows `has_api_key` only after save |
| Max tool rounds | LLM ↔ tool loop limit (1–20, default 12) |
| Request JSON extras | Per-provider JSON merged into the chat request (OpenAI, Anthropic, Ollama, vLLM). Reserved fields (`messages`, `tools`, `stream`, `model`, `system`) cannot be overridden. Example for Ollama thinking: `{"think": true}` |

**Settings → API tokens** is separate — used for MCP/CLI/API automation, not for the web chat session.

### HTTP endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/agent/status` | Public: `{ enabled, configured, provider, model }` |
| `GET /api/agent/settings` | Admin: full settings + `config_source` |
| `PUT /api/agent/settings` | Admin: update settings |
| `GET /api/agent/ws` | WebSocket chat (see below) |

### Built-in tools

The agent LLM can call:

| Tool | Maps to |
|------|---------|
| `get_monitoring_status` | `GET /api/status` |
| `list_incidents` | `GET /api/incidents` |
| `list_targets` | `GET /api/targets` |
| `update_target` | `PATCH /api/targets/:id` (pause = `enabled: false`) |
| `list_groups` | `GET /api/groups` |
| `list_api_routes` | Compact core + plugin routes (`GET /api/plugins`) |
| `umpire_api_request` | Any `/api/…` route (blocks `/api/agent/*`) |

When no named tool matches, the model should call `list_api_routes` then `umpire_api_request`. That catalog is the web-agent analog of MCP `umpire_list_routes`: compact `{method, path, description}` rows (core list plus plugin paths from `GET /api/plugins`). It does not dump OpenAPI or `GET /api/schema`.

Tool execution uses `app.inject()` with the **WebSocket session cookie** (and `Authorization` if present), so RBAC matches the logged-in user.

### Agent CLI

For terminal chat (LLM runs on your machine, not the API server):

```bash
cd agent && npm install && npm run build
export OPENAI_API_KEY=sk-…
export UMPIRE_BASE_URL=http://localhost:8089
export UMPIRE_API_TOKEN=umpire_…   # when auth on
npm start
```

Details: [agent/README.md](../agent/README.md).

---

## WebSockets

UMPIRE exposes **three** realtime mechanisms. Do not confuse them:

| Mechanism | Path | Purpose |
|-----------|------|---------|
| **Agent chat** | `GET /api/agent/ws` | LLM tool-calling loop; streams assistant tokens |
| **HTTP bridge** | `GET /api/ws` | JSON RPC over WebSocket → any `/api` route via `app.inject()` |
| **Dashboard SSE** | `GET /api/stream` | Server-sent events for UI live updates |

### Agent chat WebSocket (`/api/agent/ws`)

**Auth:** WebSocket upgrade is allowed without auth; each `chat` frame requires a logged-in session (browser `umpire_session` cookie). Bearer tokens are **not** used on this endpoint — use MCP or `/api/ws` for token-based automation.

**On connect**, server sends:

```json
{ "type": "ready", "enabled": true, "configured": true, "provider": "openai", "model": "gpt-4o-mini" }
```

**Client → server**

| Frame | Fields | Response |
|-------|--------|----------|
| Ping | `{ "type": "ping", "id": "…" }` | `{ "type": "pong", "id": "…" }` |
| Chat | `{ "type": "chat", "id": "…", "message": "…", "history?": [{ "role": "user"|"assistant", "content": "…" }] }` | See below |

`history` is optional; server keeps the last 20 user/assistant turns.

**Server → client (chat flow)**

| Event | When | Payload |
|-------|------|---------|
| `started` | Chat accepted | `{ "type": "started", "id" }` |
| `tool_start` | Before a tool runs | `{ "type": "tool_start", "id", "tool", "args" }` |
| `tool_end` | After a tool runs | `{ "type": "tool_end", "id", "tool", "summary" }` |
| `reasoning_delta` | Streaming reasoning/thinking chunk | `{ "type": "reasoning_delta", "id", "delta" }` |
| `assistant_delta` | Streaming token chunk | `{ "type": "assistant_delta", "id", "delta" }` |
| `assistant` | Full message (non-streaming fallback, e.g. CLI) | `{ "type": "assistant", "id", "message" }` |
| `done` | Turn complete | `{ "type": "done", "id", "message", "reasoning?" }` |
| `error` | Failure | `{ "type": "error", "id", "error" }` |

During the final answer turn, the UI appends `assistant_delta` chunks in real time, then `done` carries the complete message. If the model emits reasoning/thinking tokens, `reasoning_delta` is streamed into a collapsible Reasoning block. Tool-call rounds emit `tool_start` / `tool_end` only (no answer text until the model produces a final answer).

Implementation: [`api/src/routes/agent-ws.ts`](../api/src/routes/agent-ws.ts), [`web/src/pages/Agent.tsx`](../web/src/pages/Agent.tsx), streaming in [`agent/src/llm.ts`](../agent/src/llm.ts).

### HTTP bridge WebSocket (`/api/ws`)

General-purpose RPC: send an HTTP-shaped frame, receive status + body. Same auth as HTTP (session cookie jar per connection; Bearer on upgrade where supported).

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

**Server → client**

```json
{ "id": "req-1", "status": 200, "headers": { "content-type": "application/json" }, "body": [] }
```

On connect: `{ "type": "connected", "auth": { … } }`.

Blocked paths (must use dedicated endpoints): `/api/ws`, `/api/agent/ws`, `/api/stream`.

Details: [WebSocket HTTP bridge](core.md#websocket-http-bridge) in the core guide.

### Dashboard SSE (`/api/stream`)

Not LLM streaming. Events: `plugin-manager.updated`, `targets.updated`, `status.updated`, `incidents.updated`. Used by the web dashboard and browser extensions.

---

## Configuration sources

Web agent LLM config resolves in this order:

1. **Database** — values saved in **Settings → AI Agent** (`config_source: database`)
2. **Environment** — API server env vars when no DB settings exist (`config_source: environment`)
3. **None** — agent disabled or incomplete (`config_source: none`, `configured: false`)

### Environment variables (API server / CLI fallback)

| Variable | Purpose |
|----------|---------|
| `AGENT_LLM_PROVIDER` | `openai` (default), `anthropic`, `ollama`, `vllm` |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` | OpenAI-compatible |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Anthropic |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_API_KEY` | Ollama (OpenAI-compatible API) |
| `VLLM_BASE_URL`, `VLLM_MODEL`, `VLLM_API_KEY` | vLLM |
| `AGENT_MAX_TOOL_ROUNDS` | Default 12, max 20 |
| `OPENAI_REQUEST_EXTRAS`, `ANTHROPIC_REQUEST_EXTRAS`, `OLLAMA_REQUEST_EXTRAS`, `VLLM_REQUEST_EXTRAS` | Optional JSON object merged into that provider's chat request |
| `AGENT_REQUEST_EXTRAS` | Fallback extras JSON for the active provider when the provider-specific var is empty |
| `UMPIRE_BASE_URL`, `UMPIRE_API_TOKEN` / `UMPIRE_TOKEN` | Agent CLI API access |

For Ollama from Docker, point `OLLAMA_BASE_URL` at the host (e.g. `http://host.docker.internal:11434/v1`).

MCP only needs `UMPIRE_BASE_URL` and `UMPIRE_API_TOKEN` (see [`.env.example`](../.env.example)).

---

## Reverse proxy and `BASE_PATH`

WebSocket paths must be proxied with HTTP/1.1 upgrade headers:

- Agent chat: `/api/agent/ws` (or `/umpire/api/agent/ws` when `BASE_PATH=/umpire`)
- HTTP bridge: `/api/ws`
- SSE: `/api/stream`

Example (nginx):

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

Set `UMPIRE_BASE_URL` to the same origin users open in the browser (including `BASE_PATH`).

When `BASE_PATH=/umpire`, the web image includes a direct nginx location for `/umpire/api/agent/ws`; your front reverse proxy must still forward `Upgrade` and `Connection`.

---

## Related docs

- [MCP server](../mcp/README.md) — install, tools, host config examples
- [Agent CLI](../agent/README.md) — terminal chat and provider env vars
- [Core guide — auth & tokens](core.md#authentication-and-rbac)
- [Core guide — WebSocket bridge](core.md#websocket-http-bridge)
- [Core guide — SSE realtime](core.md#realtime)
- [README — HTTP API list](../README.md#api)
