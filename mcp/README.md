# UMPIRE MCP server

[Model Context Protocol](https://modelcontextprotocol.io/) server that exposes the UMPIRE HTTP API to AI agents (Claude Desktop, Cursor, etc.). Works with any LLM host that supports MCP tool calling.

The MCP server does **not** embed an LLM — you plug in your own model and API keys in the host application.

## Install

```bash
cd mcp
npm install
npm run build
```

## Configure

| Variable           | Required        | Description                                             |
| ------------------ | --------------- | ------------------------------------------------------- |
| `UMPIRE_BASE_URL`  | No              | UMPIRE web/API origin (default `http://localhost:8089`) |
| `UMPIRE_API_TOKEN` | When auth is on | Bearer token from `POST /api/tokens`                    |

When `auth_enabled` is false, no token is needed.

### Create an API token

1. Enable auth and create a user in the UMPIRE Settings UI.
2. Log in and create a token:

```bash
curl -s -c /tmp/umpire.cookies -X POST http://localhost:8089/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"your-password"}'

curl -s -b /tmp/umpire.cookies -X POST http://localhost:8089/api/tokens \
  -H 'content-type: application/json' \
  -d '{"label":"claude-agent","expires_in_days":90}'
```

Copy the `token` field (`umpire_…`) into `UMPIRE_API_TOKEN`. It is shown **once**.

Use a dedicated user/role with the minimum permissions your agent needs (e.g. read-only for monitoring, admin only if the agent must change targets).

## Run

```bash
UMPIRE_BASE_URL=http://localhost:8089 \
UMPIRE_API_TOKEN=umpire_… \
npm start
```

Or during development:

```bash
UMPIRE_API_TOKEN=umpire_… npm run dev
```

## Claude Desktop example

```json
{
  "mcpServers": {
    "umpire": {
      "command": "node",
      "args": ["/path/to/umpire/mcp/dist/index.js"],
      "env": {
        "UMPIRE_BASE_URL": "http://localhost:8089",
        "UMPIRE_API_TOKEN": "umpire_…"
      }
    }
  }
}
```

## Tools

| Tool                           | Purpose                                                      |
| ------------------------------ | ------------------------------------------------------------ |
| `umpire_request`               | Generic HTTP proxy — any `/api/…` route including plugins    |
| `umpire_list_routes`           | Discover core + plugin routes and their dedicated tool names |
| `get_status`, `get_targets`, … | One tool per core/plugin route (generated at startup)        |

Auth and RBAC match the HTTP API: the token inherits the creating user's role (`read_only`, custom plugin allowlists, admin, etc.).

## Layout

```text
mcp/
  src/
    index.ts    # MCP server entry (stdio)
    client.ts   # HTTP client with Bearer auth
    routes.ts   # Core route catalog + plugin route helpers
```

See also [docs/core.md](../docs/core.md#authentication-and-rbac) and [docs/core.md](../docs/core.md#mcp-agents).
