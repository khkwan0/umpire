# UMPIRE Agent CLI

Interactive AI agent for UMPIRE monitoring. Uses an LLM with tool calling to query live status, incidents, targets, and the full HTTP API.

For MCP integration (LLM in Cursor / Claude Desktop), see [mcp/README.md](../mcp/README.md). For the full operator guide, see [docs/agents.md](../docs/agents.md).

## Install

```bash
cd agent
npm install
npm run build
```

## Configure

### LLM

**Web UI (recommended):** **Settings → AI Agent** — enable, pick provider/model, API key, max tool rounds, optional per-provider request JSON extras. Stored in the database on the API server.

**CLI and API fallback:** environment variables on the machine running the CLI (or API server when no DB settings exist).

**OpenAI-compatible** (default):

```bash
export OPENAI_API_KEY=sk-…
export OPENAI_MODEL=gpt-4o-mini          # optional
export OPENAI_BASE_URL=https://api.openai.com/v1  # optional
```

**Anthropic**:

```bash
export AGENT_LLM_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-…
export ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

**Ollama** (OpenAI-compatible):

```bash
export AGENT_LLM_PROVIDER=ollama
export OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
export OLLAMA_MODEL=llama3.2
```

From Docker, use `http://host.docker.internal:11434/v1` to reach Ollama on the host.

**vLLM**:

```bash
export AGENT_LLM_PROVIDER=vllm
export VLLM_BASE_URL=http://127.0.0.1:8000/v1
export VLLM_MODEL=your-model
export VLLM_API_KEY=optional
```

`config_source` in **Settings → AI Agent** shows whether the server uses `database`, `environment`, or `none`.

### UMPIRE API (CLI)

```bash
export UMPIRE_BASE_URL=http://localhost:8089
export UMPIRE_API_TOKEN=umpire_…   # when auth is enabled
```

Create tokens under **Settings → API tokens**.

## Run

```bash
npm start          # interactive chat
npm run dev        # same via tsx
umpire-agent status
```

The CLI waits for the full LLM response (no terminal streaming). The web UI streams tokens in real time.

## Built-in tools

| Tool                    | Purpose                                    |
| ----------------------- | ------------------------------------------ |
| `get_monitoring_status` | Dashboard health (`GET /api/status`)       |
| `list_incidents`        | Outage/recovery log                        |
| `list_targets`          | All targets                                |
| `update_target`         | Pause/resume or patch a target             |
| `list_groups`           | Groups (optional `tree=1`)                 |
| `list_api_routes`       | Compact core + plugin HTTP route catalog   |
| `umpire_api_request`    | Any `/api/…` route (blocks `/api/agent/*`) |

## Web UI

The **Agent** tab (`/agent`) uses the same agent loop over WebSocket (`GET /api/agent/ws`).

1. Configure **Settings → AI Agent** (admin).
2. Log in — chat uses your session cookie, not an API token.
3. Send a message; tool calls show as they run; the final answer **streams** token-by-token.

### WebSocket protocol (summary)

**Client → server:** `{ "type": "chat", "id", "message", "history?" }`

**Server → client:** `ready`, `started`, `tool_start`, `tool_end`, `reasoning_delta`, `assistant_delta`, `done`, `error`

Full reference: [docs/agents.md](../docs/agents.md#agent-chat-websocket-apagentws).

## Layout

```text
agent/
  src/
    runner.ts   # tool-calling loop
    llm.ts      # OpenAI-compatible + Anthropic (streaming)
    stream.ts   # SSE line parser
    tools.ts    # built-in tool definitions
    routes.ts   # compact HTTP catalog for list_api_routes
    config.ts   # provider resolution
    cli.ts      # terminal entry
```

See also [docs/agents.md](../docs/agents.md) and [docs/core.md](../docs/core.md#ai-agents-mcp-and-built-in-web-chat).
